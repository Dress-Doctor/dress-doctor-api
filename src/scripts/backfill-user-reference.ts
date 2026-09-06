/**
 * One-shot backfill: give every pre-existing user a `reference`.
 *
 * `reference` was added long after the user collection was in use, so the rows
 * already in the database have the field missing. The unique index is sparse,
 * which is what lets it be built over those rows at all — but a user with no
 * reference cannot be opened from the admin user file, which addresses every
 * row by it, so they need filling in once.
 *
 * Idempotent: only documents with no reference are touched, so a re-run after
 * an interrupted pass picks up exactly what is left.
 *
 * Run:  npm run backfill:user-reference
 */
import { Logger } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { createScriptContext } from './script-context';
import { CodeGeneratorService } from './../helper/service/code-generator.service';
import { User } from './../schema/user/user.schema';

async function backfill() {
  const logger = new Logger('BackfillUserReference');
  const app = await createScriptContext();

  try {
    const userModel = app.get<Model<User>>(getModelToken(User.name));
    const codeService = app.get(CodeGeneratorService);

    const missing = {
      $or: [{ reference: { $exists: false } }, { reference: null }],
    };
    const total = await userModel.countDocuments(missing);
    logger.log(`${total} user(s) without a reference`);

    let done = 0;
    const cursor = userModel.find(missing).select('_id').lean().cursor();
    for await (const user of cursor) {
      const reference = await codeService.generateUserReference();
      await userModel.updateOne(
        { _id: user._id },
        { $set: { reference } },
        // No audit context: this fills in a field that should always have
        // been there, it is not a change anyone made to the user.
        { timestamps: false },
      );
      done += 1;
      if (done % 100 === 0) logger.log(`… ${done}/${total}`);
    }

    logger.log(`✅ Backfilled ${done} user reference(s)`);
  } finally {
    await app.close();
  }
}

backfill().catch((error) => {
  new Logger('BackfillUserReference').error(error);
  process.exit(1);
});
