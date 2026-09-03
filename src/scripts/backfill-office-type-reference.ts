/**
 * One-shot backfill: give every pre-existing office type a `reference`.
 *
 * `reference` was added after the office types were seeded, so the rows
 * already in the database have the field missing. The unique index is sparse,
 * which is what lets it be built over those rows at all — but a status with no
 * reference cannot be opened or edited from the reference screen, which
 * addresses every row by it, so they need filling in once.
 *
 * Idempotent: only documents with no reference are touched, so a re-run after
 * an interrupted pass picks up exactly what is left.
 *
 * Run:  npm run backfill:office-type-reference
 */
import { Logger } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { createScriptContext } from './script-context';
import { CodeGeneratorService } from './../helper/service/code-generator.service';
import { OfficeType } from './../schema/office/office-type.schema';

async function backfill() {
  const logger = new Logger('BackfillOfficeTypeReference');
  const app = await createScriptContext();

  try {
    const officeTypeModel = app.get<Model<OfficeType>>(
      getModelToken(OfficeType.name),
    );
    const codeService = app.get(CodeGeneratorService);

    const missing = {
      $or: [{ reference: { $exists: false } }, { reference: null }],
    };
    const total = await officeTypeModel.countDocuments(missing);
    logger.log(`${total} office type(s) without a reference`);

    let done = 0;
    const cursor = officeTypeModel.find(missing).select('_id').lean().cursor();
    for await (const status of cursor) {
      const reference = await codeService.generateOfficeTypeReference();
      await officeTypeModel.updateOne(
        { _id: status._id },
        { $set: { reference } },
        // No audit context: this fills in a field that should always have
        // been there, it is not a change anyone made to the status.
        { timestamps: false },
      );
      done += 1;
      if (done % 100 === 0) logger.log(`… ${done}/${total}`);
    }

    logger.log(`✅ Backfilled ${done} office type reference(s)`);
  } finally {
    await app.close();
  }
}

backfill().catch((error) => {
  new Logger('BackfillOfficeTypeReference').error(error);
  process.exit(1);
});
