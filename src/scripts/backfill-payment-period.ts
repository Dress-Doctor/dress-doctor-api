/**
 * One-shot migration: `debtType` → `paymentPeriod`.
 *
 * The field was renamed and its values re-spelled ('Current' → 'CURRENT',
 * 'Old Debt' → 'PRIOR'), and it stopped being caller-supplied: it is now
 * derived from the payment's month against the order's `receivedAt`. Rows
 * written before that carry the old field, and their old value was whatever
 * the caller asserted — which is exactly what the rename is meant to stop
 * trusting. So each row is recomputed from its own dates rather than mapped
 * across, and the stale field is dropped.
 *
 * Payments whose order no longer exists keep the mapped old value, since there
 * is no date to recompute from.
 *
 * Idempotent: only rows still carrying `debtType`, or missing `paymentPeriod`,
 * are touched — a re-run after an interrupted pass picks up what is left.
 *
 * Run:  npm run backfill:payment-period
 */
import { Logger } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { computePaymentPeriod } from './../api/payment/payment-status.util';
import { createScriptContext } from './script-context';
import { Order } from './../schema/order/order.schema';
import { PaymentPeriodEnum } from './../schema/payment/payment.dto';
import { Payment } from './../schema/payment/payment.schema';

type LegacyPayment = {
  _id: Types.ObjectId;
  orderId?: Types.ObjectId;
  paidAt?: Date;
  debtType?: string;
};

async function backfill() {
  const logger = new Logger('BackfillPaymentPeriod');
  const app = await createScriptContext();

  try {
    const paymentModel = app.get<Model<Payment>>(getModelToken(Payment.name));
    const orderModel = app.get<Model<Order>>(getModelToken(Order.name));

    const stale = {
      $or: [
        { debtType: { $exists: true } },
        { paymentPeriod: { $exists: false } },
      ],
    };
    const total = await paymentModel.countDocuments(stale);
    logger.log(`${total} payment(s) to migrate`);

    let done = 0;
    // Cursor rather than find(): the collection can be large and every row is
    // recomputed independently, so nothing needs to be held in memory at once.
    const cursor = paymentModel
      .find(stale)
      .select('_id orderId paidAt debtType')
      .lean<LegacyPayment>()
      .cursor();

    for await (const payment of cursor) {
      // Fall back to the old value's meaning when the order is gone, and to
      // CURRENT when there is nothing at all to go on — the default the field
      // has always carried.
      let period =
        payment.debtType === 'Old Debt'
          ? PaymentPeriodEnum.PRIOR
          : PaymentPeriodEnum.CURRENT;

      const order = payment.orderId
        ? await orderModel.findById(payment.orderId).select('receivedAt').lean()
        : null;

      if (order?.receivedAt && payment.paidAt) {
        period = computePaymentPeriod(payment.paidAt, order.receivedAt);
      }

      await paymentModel.updateOne(
        { _id: payment._id },
        { $set: { paymentPeriod: period }, $unset: { debtType: '' } },
        {
          // No audit context: this is a schema migration, not a change anyone
          // made to the payment.
          timestamps: false,
          // `debtType` is no longer a schema path, and strict mode strips
          // update operators that name unknown paths — so the $unset was being
          // dropped in silence and the old field survived every run.
          strict: false,
        },
      );
      done += 1;
      if (done % 100 === 0) logger.log(`… ${done}/${total}`);
    }

    logger.log(`✅ Migrated ${done} payment(s) to paymentPeriod`);
  } finally {
    await app.close();
  }
}

backfill().catch((error) => {
  new Logger('BackfillPaymentPeriod').error(error);
  process.exit(1);
});
