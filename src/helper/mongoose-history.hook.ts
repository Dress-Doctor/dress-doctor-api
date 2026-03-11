import { Logger } from '@nestjs/common';
import { Model, Query, Schema, Types, Document } from 'mongoose';
import { HistoryActionEnum } from '../schema/admin/admin.dto';
import { ChangedFieldDto } from '../schema/user/user.dto';

interface QueryWithPrevious<T> extends Query<T, T> {
  _previous?: T;
}

interface QueryContext {
  changedBy?: Types.ObjectId;
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

  // Pre-hook: capture the previous state before update
  schema.pre('findOneAndUpdate', async function () {
    const query = this as QueryWithPrevious<T>;
    const previous = (await query.model
      .findOne(query.getQuery())
      .lean()) as T | null;
    query._previous = previous ?? undefined;
  });

  // Post-hook: save history after document is created
  schema.post('save', async function (doc: T, next) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const changedBy = (doc as any).$locals?.changedBy;

      await historyModel.create({
        action: HistoryActionEnum.CREATE,
        changedBy: changedBy as Types.ObjectId,
        [idField]: doc[idField as keyof T] || doc._id,
        snapshot: doc.toObject() as Record<string, any>,
      });
      logger.log(`History recorded for ${resourceName} CREATE`);
    } catch (error) {
      logger.error(
        `Failed to save history for ${resourceName} CREATE: ${error}`,
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

      if (!previous) {
        // No previous record means it was a create
        await historyModel.create({
          changedBy: context?.changedBy,
          action: HistoryActionEnum.CREATE,
          [idField]: doc[idField as keyof T] || doc._id,
          snapshot: doc.toObject() as Record<string, any>,
        });
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

      await historyModel.create({
        changedFields,
        changedBy: context?.changedBy,
        action: HistoryActionEnum.UPDATE,
        [idField]: doc[idField as keyof T] || doc._id,
        snapshot: doc.toObject() as Record<string, any>,
      });

      logger.log(`History recorded for ${resourceName} UPDATE`);
    } catch (error) {
      logger.error(
        `Failed to save history for ${resourceName} UPDATE: ${error}`,
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

      await historyModel.create({
        changedBy: context?.changedBy,
        action: HistoryActionEnum.DELETE,
        [idField]: doc[idField as keyof T] || doc._id,
        snapshot: doc.toObject() as Record<string, any>,
      });

      logger.log(`History recorded for ${resourceName} DELETE`);
    } catch (error) {
      logger.error(
        `Failed to save history for ${resourceName} DELETE: ${error}`,
      );
    }
    next();
  });

  return schema;
}
