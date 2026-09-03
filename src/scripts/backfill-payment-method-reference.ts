/**
 * One-shot backfill: give every pre-existing payment method a `reference`.
 *
 * `reference` was added after the payment methods were seeded, so the rows
 * already in the database have the field missing. The unique index is sparse,
 * which is what lets it be built over those rows at all — but a status with no
 * reference cannot be opened or edited from the reference screen, which
 * addresses every row by it, so they need filling in once.
 *
 * Idempotent: only documents with no reference are touched, so a re-run after
 * an interrupted pass picks up exactly what is left.
 *
 * Run:  npm run backfill:payment-method-reference
 */
import { Logger } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { createScriptContext } from './script-context';
import { CodeGeneratorService } from './../helper/service/code-generator.service';
import { PaymentMethod } from './../schema/payment/payment-method.schema';

async function backfill() {
  const logger = new Logger('BackfillPaymentMethodReference');
  const app = await createScriptContext();

  try {
    const paymentMethodModel = app.get<Model<PaymentMethod>>(
      getModelToken(PaymentMethod.name),
    );
    const codeService = app.get(CodeGeneratorService);

    const missing = {
      $or: [{ reference: { $exists: false } }, { reference: null }],
    };
    const total = await paymentMethodModel.countDocuments(missing);
    logger.log(`${total} payment method(s) without a reference`);

    let done = 0;
    const cursor = paymentMethodModel
      .find(missing)
      .select('_id')
      .lean()
      .cursor();
    for await (const status of cursor) {
      const reference = await codeService.generatePaymentMethodReference();
      await paymentMethodModel.updateOne(
        { _id: status._id },
        { $set: { reference } },
        // No audit context: this fills in a field that should always have
        // been there, it is not a change anyone made to the status.
        { timestamps: false },
      );
      done += 1;
      if (done % 100 === 0) logger.log(`… ${done}/${total}`);
    }

    logger.log(`✅ Backfilled ${done} payment method reference(s)`);
  } finally {
    await app.close();
  }
}

backfill().catch((error) => {
  new Logger('BackfillPaymentMethodReference').error(error);
  process.exit(1);
});
