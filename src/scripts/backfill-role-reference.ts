/**
 * One-shot backfill: give every pre-existing role a `reference`.
 *
 * `reference` was added after the roles were seeded, so the rows already in the
 * database have the field missing. The unique index is sparse, which is what
 * lets it be built over those rows at all — but a role with no reference cannot
 * be opened or edited from the roles screen, which addresses every row by it,
 * so they need filling in once.
 *
 * Idempotent: only documents with no reference are touched, so a re-run after
 * an interrupted pass picks up exactly what is left.
 *
 * Run:  npm run backfill:role-reference
 */
import { Logger } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { createScriptContext } from './script-context';
import { CodeGeneratorService } from './../helper/service/code-generator.service';
import { Role } from './../schema/admin/role.schema';

async function backfill() {
  const logger = new Logger('BackfillRoleReference');
  const app = await createScriptContext();

  try {
    const roleModel = app.get<Model<Role>>(getModelToken(Role.name));
    const codeService = app.get(CodeGeneratorService);

    const missing = {
      $or: [{ reference: { $exists: false } }, { reference: null }],
    };
    const total = await roleModel.countDocuments(missing);
    logger.log(`${total} role(s) without a reference`);

    let done = 0;
    const cursor = roleModel.find(missing).select('_id').lean().cursor();
    for await (const role of cursor) {
      const reference = await codeService.generateRoleReference();
      await roleModel.updateOne(
        { _id: role._id },
        { $set: { reference } },
        // No audit context: this fills in a field that should always have
        // been there, it is not a change anyone made to the role.
        { timestamps: false },
      );
      done += 1;
      if (done % 100 === 0) logger.log(`… ${done}/${total}`);
    }

    logger.log(`✅ Backfilled ${done} role reference(s)`);
  } finally {
    await app.close();
  }
}

backfill().catch((error) => {
  new Logger('BackfillRoleReference').error(error);
  process.exit(1);
});
