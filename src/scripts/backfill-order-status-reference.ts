/**
 * One-shot backfill: give every pre-existing order status a `reference`.
 *
 * `reference` was added after the order statuses were seeded, so the rows
 * already in the database have the field missing. The unique index is sparse,
 * which is what lets it be built over those rows at all — but a status with no
 * reference cannot be opened or edited from the reference screen, which
 * addresses every row by it, so they need filling in once.
 *
 * Idempotent: only documents with no reference are touched, so a re-run after
 * an interrupted pass picks up exactly what is left.
 *
 * Run:  npm run backfill:order-status-reference
 */
import { Logger } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { createScriptContext } from './script-context';
import { CodeGeneratorService } from './../helper/service/code-generator.service';
import { OrderStatus } from './../schema/order/order-status.schema';

async function backfill() {
  const logger = new Logger('BackfillOrderStatusReference');
  const app = await createScriptContext();

  try {
    const orderStatusModel = app.get<Model<OrderStatus>>(
      getModelToken(OrderStatus.name),
    );
    const codeService = app.get(CodeGeneratorService);

    const missing = {
      $or: [{ reference: { $exists: false } }, { reference: null }],
    };
    const total = await orderStatusModel.countDocuments(missing);
    logger.log(`${total} order status(es) without a reference`);

    let done = 0;
    const cursor = orderStatusModel.find(missing).select('_id').lean().cursor();
    for await (const status of cursor) {
      const reference = await codeService.generateOrderStatusReference();
      await orderStatusModel.updateOne(
        { _id: status._id },
        { $set: { reference } },
        // No audit context: this fills in a field that should always have
        // been there, it is not a change anyone made to the status.
        { timestamps: false },
      );
      done += 1;
      if (done % 100 === 0) logger.log(`… ${done}/${total}`);
    }

    logger.log(`✅ Backfilled ${done} order status reference(s)`);
  } finally {
    await app.close();
  }
}

backfill().catch((error) => {
  new Logger('BackfillOrderStatusReference').error(error);
  process.exit(1);
});
