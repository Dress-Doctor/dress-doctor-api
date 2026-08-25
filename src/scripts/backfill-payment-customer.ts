/**
 * One-shot backfill: align every payment's `customerId` with its order's.
 *
 * A payment's customer is not independent information — it is whoever the
 * order belongs to, and the live create path copies `order.customerId`
 * straight across. Two things left rows disagreeing with that:
 *
 *  - the test seeder wrote the *Customer profile* id where a *User* id
 *    belongs, so the join to `user` matched nothing and the customer came
 *    back blank on the list and in the export;
 *  - older rows carry no `customerId` at all.
 *
 * Both are repaired the same way: read the order, copy its `customerId`. The
 * order is the source of truth, so a payment that disagrees is wrong by
 * definition — there is no case where the two legitimately differ.
 *
 * Payments whose order no longer exists are left alone and counted, since
 * there is nothing to copy from.
 *
 * Idempotent: a row already matching its order is skipped, so a re-run after
 * an interrupted pass only touches what is left.
 *
 * Run:  npm run backfill:payment-customer
 */
import { Logger } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Order } from './../schema/order/order.schema';
import { Payment } from './../schema/payment/payment.schema';
import { createScriptContext } from './script-context';

type LeanPayment = {
  _id: Types.ObjectId;
  orderId?: Types.ObjectId;
  customerId?: Types.ObjectId;
};

async function backfill() {
  const logger = new Logger('BackfillPaymentCustomer');
  const app = await createScriptContext();

  try {
    const paymentModel = app.get<Model<Payment>>(getModelToken(Payment.name));
    const orderModel = app.get<Model<Order>>(getModelToken(Order.name));

    const total = await paymentModel.countDocuments({});
    logger.log(`${total} payment(s) to check`);

    let fixed = 0;
    let alreadyCorrect = 0;
    let orphaned = 0;

    // Cursor rather than find(): the collection can be large and every row is
    // checked independently, so nothing needs to be held in memory at once.
    const cursor = paymentModel
      .find({})
      .select('_id orderId customerId')
      .lean<LeanPayment>()
      .cursor();

    for await (const payment of cursor) {
      const order = payment.orderId
        ? await orderModel.findById(payment.orderId).select('customerId').lean()
        : null;

      if (!order?.customerId) {
        orphaned += 1;
        continue;
      }

      if (payment.customerId?.equals(order.customerId)) {
        alreadyCorrect += 1;
        continue;
      }

      await paymentModel.updateOne(
        { _id: payment._id },
        { $set: { customerId: order.customerId } },
        // No audit context: this repairs a field that should always have
        // mirrored the order, it is not a change anyone made to the payment.
        { timestamps: false },
      );
      fixed += 1;
    }

    logger.log(
      `✅ ${fixed} repaired · ${alreadyCorrect} already correct · ` +
        `${orphaned} skipped (no order to copy from)`,
    );
  } finally {
    await app.close();
  }
}

backfill().catch((error) => {
  new Logger('BackfillPaymentCustomer').error(error);
  process.exit(1);
});
