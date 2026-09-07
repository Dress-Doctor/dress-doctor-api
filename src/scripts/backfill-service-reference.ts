/**
 * One-shot backfill: give every pre-existing service a `reference`.
 *
 * `reference` was added to the catalogue after these rows were seeded, so the
 * rows already in the database have the field missing. The unique index is
 * sparse, which is what lets it be built over those rows at all — but a row
 * with no reference cannot be opened or edited from the catalogue screen,
 * which addresses every row by it, so they need filling in once.
 *
 * Idempotent: only documents with no reference are touched, so a re-run after
 * an interrupted pass picks up exactly what is left.
 *
 * Run:  npm run backfill:service-reference
 */
import { Logger } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CodeGeneratorService } from './../helper/service/code-generator.service';
import { Service } from './../schema/catalog/service.schema';
import { createScriptContext } from './script-context';

async function backfill() {
  const logger = new Logger('BackfillServiceReference');
  const app = await createScriptContext();

  try {
    const serviceModel = app.get<Model<Service>>(getModelToken(Service.name));
    const codeService = app.get(CodeGeneratorService);

    const missing = {
      $or: [{ reference: { $exists: false } }, { reference: null }],
    };
    const total = await serviceModel.countDocuments(missing);
    logger.log(`${total} service(s) without a reference`);

    let done = 0;
    const cursor = serviceModel.find(missing).select('_id').lean().cursor();
    for await (const row of cursor) {
      const reference = await codeService.generateServiceReference();
      await serviceModel.updateOne(
        { _id: row._id },
        { $set: { reference } },
        // No audit context: this fills in a field that should always have
        // been there, it is not a change anyone made to the row.
        { timestamps: false },
      );
      done += 1;
      if (done % 100 === 0) logger.log(`… ${done}/${total}`);
    }

    logger.log(`✅ Backfilled ${done} service reference(s)`);
  } finally {
    await app.close();
  }
}

backfill().catch((error) => {
  new Logger('BackfillServiceReference').error(error);
  process.exit(1);
});
