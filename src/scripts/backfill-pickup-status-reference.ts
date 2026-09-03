/**
 * One-shot backfill: give every pre-existing pickup status a `reference`.
 *
 * `reference` was added after the pickup statuses were seeded, so the rows
 * already in the database have the field missing. The unique index is sparse,
 * which is what lets it be built over those rows at all — but a status with no
 * reference cannot be opened or edited from the reference screen, which
 * addresses every row by it, so they need filling in once.
 *
 * Idempotent: only documents with no reference are touched, so a re-run after
 * an interrupted pass picks up exactly what is left.
 *
 * Run:  npm run backfill:pickup-status-reference
 */
import { Logger } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { createScriptContext } from './script-context';
import { CodeGeneratorService } from './../helper/service/code-generator.service';
import { PickupStatus } from './../schema/pickup/pickup-status.schema';

async function backfill() {
  const logger = new Logger('BackfillPickupStatusReference');
  const app = await createScriptContext();

  try {
    const pickupStatusModel = app.get<Model<PickupStatus>>(
      getModelToken(PickupStatus.name),
    );
    const codeService = app.get(CodeGeneratorService);

    const missing = {
      $or: [{ reference: { $exists: false } }, { reference: null }],
    };
    const total = await pickupStatusModel.countDocuments(missing);
    logger.log(`${total} pickup status(es) without a reference`);

    let done = 0;
    const cursor = pickupStatusModel
      .find(missing)
      .select('_id')
      .lean()
      .cursor();
    for await (const status of cursor) {
      const reference = await codeService.generatePickupStatusReference();
      await pickupStatusModel.updateOne(
        { _id: status._id },
        { $set: { reference } },
        // No audit context: this fills in a field that should always have
        // been there, it is not a change anyone made to the status.
        { timestamps: false },
      );
      done += 1;
      if (done % 100 === 0) logger.log(`… ${done}/${total}`);
    }

    logger.log(`✅ Backfilled ${done} pickup status reference(s)`);
  } finally {
    await app.close();
  }
}

backfill().catch((error) => {
  new Logger('BackfillPickupStatusReference').error(error);
  process.exit(1);
});
