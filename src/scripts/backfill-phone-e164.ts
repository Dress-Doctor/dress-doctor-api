/**
 * One-shot backfill: store every phone with its country code.
 *
 * Numbers used to be kept as bare national digits (`670678660`) because
 * Cameroon was the only market. They are now stored the way WhatsApp Cloud API
 * wants them — digits with the country code, no symbols (`237670678660`) — so
 * that a customer living in Douala can keep a foreign WhatsApp number.
 *
 * Nothing breaks without this: every lookup matches both spellings through
 * `phoneVariants`. Running it is what lets that tolerance eventually go away.
 *
 * Idempotent: only bare national numbers are touched, so a re-run after an
 * interrupted pass picks up exactly what is left.
 *
 * Run:  npm run backfill:phone-e164
 */
import { Logger } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { createScriptContext } from './script-context';
import { DEFAULT_DIAL_CODE, toE164Digits } from './../helper/phone';
import { maskPhone } from './../helper/pii';
import { User } from './../schema/user/user.schema';

/** A bare national number: exactly the 9 digits, nothing in front. */
const NATIONAL_ONLY = /^\d{9}$/;

async function backfill() {
  const logger = new Logger('BackfillPhoneE164');
  const app = await createScriptContext();

  try {
    const userModel = app.get<Model<User>>(getModelToken(User.name));

    const total = await userModel.countDocuments({
      $or: [
        { phone: { $regex: NATIONAL_ONLY } },
        { whatsappPhone: { $regex: NATIONAL_ONLY } },
      ],
    });
    logger.log(`${total} user(s) with a number missing its country code`);

    let done = 0;
    let skipped = 0;
    // Cursor rather than find(): every row is updated independently, so
    // nothing needs to be held in memory at once.
    const cursor = userModel
      .find({
        $or: [
          { phone: { $regex: NATIONAL_ONLY } },
          { whatsappPhone: { $regex: NATIONAL_ONLY } },
        ],
      })
      .select('_id phone whatsappPhone')
      .lean()
      .cursor();

    for await (const user of cursor) {
      const update: Record<string, string> = {};
      if (NATIONAL_ONLY.test(user.phone)) {
        update.phone = toE164Digits(user.phone);
      }
      if (user.whatsappPhone && NATIONAL_ONLY.test(user.whatsappPhone)) {
        update.whatsappPhone = toE164Digits(user.whatsappPhone);
      }
      if (!Object.keys(update).length) continue;

      /**
       * `phone` is unique. If both spellings of one number are already on the
       * books as two accounts, normalising would collide — and picking a
       * winner is a business decision, not a script's. Leave it and say so.
       */
      if (update.phone) {
        const taken = await userModel.exists({
          _id: { $ne: user._id },
          phone: update.phone,
        });
        if (taken) {
          skipped += 1;
          logger.warn(
            `${maskPhone(user.phone)} already exists with ${DEFAULT_DIAL_CODE} ` +
              `in front — left alone, merge the two accounts by hand`,
          );
          continue;
        }
      }

      // No audit context: this rewrites how a value is spelled, not what it
      // is, so there is no human decision for a history row to record.
      await userModel.updateOne({ _id: user._id }, { $set: update });
      done += 1;
    }

    logger.log(`✅ normalised ${done} user(s), skipped ${skipped}`);
  } catch (error) {
    logger.error(`backfill failed: ${(error as Error).message}`);
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

void backfill();
