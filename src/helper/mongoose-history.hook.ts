import { Logger } from '@nestjs/common';
import { Model, Query, Schema, Types, Document } from 'mongoose';
import { ActionEnum } from '../schema/admin/admin.dto';
import { ChangedFieldDto } from '../schema/user/user.dto';

interface QueryWithPrevious<T> extends Query<T, T> {
  _previous?: T;
}

interface QueryContext {
  changedBy?: Types.ObjectId;
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
      await historyModel.create({
        changedBy: doc._id,
        action: ActionEnum.CREATE,
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

      if (!previous) {
        // No previous record means it was a create
        await historyModel.create({
          [idField]: doc[idField as keyof T] || doc._id,
          changedBy: doc._id,
          action: ActionEnum.CREATE,
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
          if (previous[key as keyof T] !== update.$set?.[key as keyof T]) {
            changedFields[key] = {
              from: previous[key as keyof T],
              to: update.$set?.[key as keyof T],
            };
          }
        }
      }

      if (!Object.keys(changedFields).length) return next();

      // Get context (who made the change)
      const context = query.getOptions()?.context as QueryContext | undefined;

      await historyModel.create({
        changedFields,
        action: ActionEnum.UPDATE,
        changedBy: context?.changedBy ?? doc._id,
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

  return schema;
}
