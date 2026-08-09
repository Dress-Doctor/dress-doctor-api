import { Logger } from '@nestjs/common';
import { ClientSession, Model, Query, Schema, Types, Document } from 'mongoose';
import { HistoryActionEnum } from '../schema/admin/admin.dto';
import { ChangedFieldDto } from '../schema/user/user.dto';

interface QueryWithPrevious<T> extends Query<T, T> {
  _previous?: T;
}

interface QueryContext {
  changedBy?: Types.ObjectId;
}

/**
 * The transaction a write is running in, if any.
 *
 * Everything this file does has to join that transaction. Reading the
 * previous state outside it cannot see a document the same transaction just
 * created, which would make an update look like a create and lose the diff;
 * writing the history row outside it would leave an audit entry behind for a
 * change that later rolled back.
 */
function sessionOf(query: {
  getOptions: () => { session?: ClientSession | null } | undefined;
}): ClientSession | undefined {
  return query.getOptions()?.session ?? undefined;
}

function normalize(value: any): any {
  if (value instanceof Types.ObjectId) {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (Array.isArray(value)) {
    return value.map(normalize);
  }

  if (value && typeof value === 'object') {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    return Object.keys(value)
      .sort()
      .reduce(
        (acc, key) => {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          acc[key] = normalize(value[key]);
          return acc;
        },
        {} as Record<string, any>,
      );
  }

  return value;
}

function isEqual(a: any, b: any): boolean {
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

/**
 * Attaches history tracking hooks (pre/post) to a Mongoose schema.
 * Automatically tracks CREATE and UPDATE actions with before/after snapshots.
 *
 * @param schema The Mongoose schema to attach hooks to
 * @param historyModel The Mongoose model for storing history records
 * @param resourceName The name of the resource for logging
 * @param idField Configuration for field names
 * @returns The modified schema
 */

type Props<T> = {
  schema: Schema<T>;
  idField: string;
  resourceName: string;
  historyModel: Model<any>;
};
export function attachHistoryHooks<T extends Document>(
  data: Props<T>,
): Schema<T> {
  const { schema, idField, resourceName, historyModel } = data;
  const logger = new Logger(`${resourceName}:History`);

  // Pre-hook: capture the previous state before update. The read joins the
  // caller's transaction — without the session it cannot see a document that
  // same transaction just created, and the update would be recorded as a
  // second CREATE with no changed fields instead of the edit it really is.
  schema.pre('findOneAndUpdate', async function () {
    const query = this as QueryWithPrevious<T>;
    const previous = (await query.model
      .findOne(query.getQuery())
      .session(sessionOf(query) ?? null)
      .lean()) as T | null;
    query._previous = previous ?? undefined;
  });

  // Post-hook: save history after document is created
  schema.post('save', async function (doc: T, next) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const changedBy = (doc as any).$locals?.changedBy;

      // Same transaction as the document itself, so a rollback takes the
      // audit entry with it rather than leaving a record of a change that
      // never happened.
      await historyModel.create(
        [
          {
            action: HistoryActionEnum.CREATE,
            changedBy: changedBy as Types.ObjectId,
            [idField]: doc[idField as keyof T] || doc._id,
            snapshot: doc.toObject() as Record<string, any>,
          },
        ],
        { session: doc.$session() ?? undefined },
      );
      logger.log(`History recorded for ${resourceName} CREATE`);
    } catch (error) {
      logger.error(
        `Failed to save history for ${resourceName} CREATE: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    next();
  });

  // Post-hook: save history after document is updated
  schema.post('findOneAndUpdate', async function (doc: T, next) {
    try {
      if (!doc) return next();

      const query = this as QueryWithPrevious<T>;
      const previous = query._previous;

      // Get context (who made the change)
      const context = query.getOptions()?.context as QueryContext | undefined;

      const session = sessionOf(query);

      if (!previous) {
        // Nothing was there before this ran: an upsert that inserted. (The
        // pre-hook reads inside the caller's transaction, so a document
        // created earlier in that same transaction is visible and does NOT
        // land here.)
        await historyModel.create(
          [
            {
              changedBy: context?.changedBy,
              action: HistoryActionEnum.CREATE,
              [idField]: doc[idField as keyof T] || doc._id,
              snapshot: doc.toObject() as Record<string, any>,
            },
          ],
          { session },
        );
        logger.log(`History recorded for ${resourceName} CREATE (via update)`);
        return next();
      }

      // Track which fields changed
      const update = query.getUpdate() as {
        $set?: Partial<T>;
      };

      const changedFields: Record<string, ChangedFieldDto> = {};
      if (update.$set) {
        for (const key of Object.keys(update.$set)) {
          if (key === 'updatedAt') continue;

          const prev = previous[key as keyof T];
          const next = update.$set?.[key as keyof T];
          if (!isEqual(prev, next)) {
            changedFields[key] = { from: prev, to: next };
          }
        }
      }

      if (!Object.keys(changedFields).length) return next();

      await historyModel.create(
        [
          {
            changedFields,
            changedBy: context?.changedBy,
            action: HistoryActionEnum.UPDATE,
            [idField]: doc[idField as keyof T] || doc._id,
            snapshot: doc.toObject() as Record<string, any>,
          },
        ],
        { session },
      );

      logger.log(`History recorded for ${resourceName} UPDATE`);
    } catch (error) {
      logger.error(
        `Failed to save history for ${resourceName} UPDATE: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    next();
  });

  // Post-hook: save history after document is deleted
  schema.post('findOneAndDelete', async function (doc: T, next) {
    try {
      if (!doc) return next();

      const query = this as Query<T, T>;
      const context = query.getOptions()?.context as QueryContext | undefined;

      await historyModel.create(
        [
          {
            changedBy: context?.changedBy,
            action: HistoryActionEnum.DELETE,
            [idField]: doc[idField as keyof T] || doc._id,
            snapshot: doc.toObject() as Record<string, any>,
          },
        ],
        { session: sessionOf(query) },
      );

      logger.log(`History recorded for ${resourceName} DELETE`);
    } catch (error) {
      logger.error(
        `Failed to save history for ${resourceName} DELETE: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    next();
  });

  return schema;
}
