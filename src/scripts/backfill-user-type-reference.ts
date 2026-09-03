/**
 * One-shot backfill: give every pre-existing user type a `reference`.
 *
 * `reference` was added after the user types were seeded, so the rows already
 * in the database have the field missing. The unique index is sparse, which
 * is what lets it be built over those rows at all — but a user type with no
 * reference cannot be opened or edited from the reference screen, which
 * addresses every row by it, so they need filling in once.
 *
 * Idempotent: only documents with no reference are touched, so a re-run after
 * an interrupted pass picks up exactly what is left.
 *
 * Run:  npm run backfill:user-type-reference
 */
import { Logger } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { createScriptContext } from './script-context';
import { CodeGeneratorService } from './../helper/service/code-generator.service';
import { UserType } from './../schema/user/user-type.schema';

async function backfill() {
  const logger = new Logger('BackfillUserTypeReference');
  const app = await createScriptContext();

  try {
    const userTypeModel = app.get<Model<UserType>>(
      getModelToken(UserType.name),
    );
    const codeService = app.get(CodeGeneratorService);

    const missing = {
      $or: [{ reference: { $exists: false } }, { reference: null }],
    };
    const total = await userTypeModel.countDocuments(missing);
    logger.log(`${total} user type(s) without a reference`);

    let done = 0;
    const cursor = userTypeModel.find(missing).select('_id').lean().cursor();
    for await (const userType of cursor) {
      const reference = await codeService.generateUserTypeReference();
      await userTypeModel.updateOne(
        { _id: userType._id },
        { $set: { reference } },
        // No audit context: this fills in a field that should always have
        // been there, it is not a change anyone made to the user type.
        { timestamps: false },
      );
      done += 1;
      if (done % 100 === 0) logger.log(`… ${done}/${total}`);
    }

    logger.log(`✅ Backfilled ${done} user type reference(s)`);
  } finally {
    await app.close();
  }
}

backfill().catch((error) => {
  new Logger('BackfillUserTypeReference').error(error);
  process.exit(1);
});
