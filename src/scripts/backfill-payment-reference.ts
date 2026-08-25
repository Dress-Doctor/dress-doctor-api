/**
 * One-shot backfill: give every pre-existing payment a `reference`.
 *
 * `reference` was added after payments were already being recorded, so rows
 * written before it exist with the field missing. The unique index is sparse,
 * which is what lets it be built over those rows at all — but a payment with
 * no reference can't be quoted on a receipt or looked up by it, so they need
 * filling in once.
 *
 * Idempotent: only documents with no reference are touched, so a re-run after
 * an interrupted pass picks up exactly what is left.
 *
 * Run:  npm run backfill:payment-reference
 */
import { Logger } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { createScriptContext } from './script-context';
import { CodeGeneratorService } from './../helper/service/code-generator.service';
import { Payment } from './../schema/payment/payment.schema';

async function backfill() {
  const logger = new Logger('BackfillPaymentReference');
  const app = await createScriptContext();

  try {
    const paymentModel = app.get<Model<Payment>>(getModelToken(Payment.name));
    const codeService = app.get(CodeGeneratorService);

    const missing = {
      $or: [{ reference: { $exists: false } }, { reference: null }],
    };
    const total = await paymentModel.countDocuments(missing);
    logger.log(`${total} payment(s) without a reference`);

    let done = 0;
    // Cursor rather than find(): the collection can be large and every row is
    // updated independently, so nothing needs to be held in memory at once.
    const cursor = paymentModel.find(missing).select('_id').lean().cursor();
    for await (const payment of cursor) {
      const reference = await codeService.generatePaymentReference();
      await paymentModel.updateOne(
        { _id: payment._id },
        { $set: { reference } },
        // No audit context: this fills in a field that should always have been
        // there, it is not a change anyone made to the payment.
        { timestamps: false },
      );
      done += 1;
      if (done % 100 === 0) logger.log(`… ${done}/${total}`);
    }

    logger.log(`✅ Backfilled ${done} payment reference(s)`);
  } finally {
    await app.close();
  }
}

backfill().catch((error) => {
  new Logger('BackfillPaymentReference').error(error);
  process.exit(1);
});
