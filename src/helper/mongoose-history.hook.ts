import { Logger } from '@nestjs/common';
import { ClientSession, Model, Query, Schema, Types, Document } from 'mongoose';
import { HistoryActionEnum } from '../schema/admin/admin.dto';
import { ChangedFieldDto } from '../schema/user/user.dto';
import { ActivityKindEnum } from '../schema/activity/activity.dto';
import { recordActivity } from './activity-recorder';

interface QueryWithPrevious<T> extends Query<T, T> {
  _previous?: T;
}

/**
 * What a write tells the audit trail about itself, passed as the query's
 * `context` option (or, on a create, as `doc.$locals`).
 *
 * `reason` is the caller's own words, taken from the `x-change-reason` header
 * that every mutating request carries. `action` lets a caller name the kind of
 * edit — calling work off is recorded as CANCEL rather than UPDATE — and is
 * only honoured for edits; a create or a delete is what it is.
 */
export interface AuditContextDto {
  changedBy?: Types.ObjectId;
  reason?: string;
  action?: HistoryActionEnum;
}

/** Kept as the old name for readability at the call sites in this file. */
type QueryContext = AuditContextDto;

/** The audit fields a create carries on `doc.$locals`. */
interface DocumentLocals {
  changedBy?: Types.ObjectId;
  reason?: string;
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

/**
 * Mirror an audit entry into the per-actor trail.
 *
 * The history row answers "what happened to this record"; this answers "what
 * did this person do", which no per-record table can without a fan-out across
 * every history collection. It joins the same transaction as the write, so a
 * rollback takes both entries with it.
 *
 * Never throws: the trail is an observer of the write, not a participant in
 * whether it succeeds.
 */
async function mirrorToActivity(input: {
  resourceName: string;
  action: HistoryActionEnum;
  changedBy?: Types.ObjectId;
  reason?: string;
  resourceId?: Types.ObjectId;
  resourceRef?: string;
  session?: ClientSession;
  logger: Logger;
}): Promise<void> {
  // A write with no actor is a seed or a migration repair. Those are recorded
  // on the history row, but they are nobody's activity.
  if (!input.changedBy) return;

  try {
    await recordActivity({
      userId: input.changedBy,
      kind: ActivityKindEnum.WRITE,
      action: `${input.resourceName.toLowerCase()}.${input.action.toLowerCase()}`,
      resource: input.resourceName,
      resourceId: input.resourceId,
      resourceRef: input.resourceRef,
      reason: input.reason,
      session: input.session,
    });
  } catch (error) {
    input.logger.error(
      `Failed to mirror ${input.resourceName} ${input.action} into the activity trail: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/**
 * The human reference a record is addressed by, when it has one. Every
 * code-bearing schema names it differently (`orderCode`, `reference`,
 * `officeCode`), so the trail takes the first that is a string rather than
 * asking 26 call sites to say which theirs is.
 */
function referenceOf(doc: Record<string, unknown>): string | undefined {
  for (const key of ['reference', 'orderCode', 'officeCode', 'code']) {
    const value = doc[key];
    if (typeof value === 'string' && value) return value;
  }
  return undefined;
}

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
      const { changedBy, reason } =
        (doc as { $locals?: DocumentLocals }).$locals ?? {};

      // Same transaction as the document itself, so a rollback takes the
      // audit entry with it rather than leaving a record of a change that
      // never happened.
      await historyModel.create(
        [
          {
            reason,
            changedBy,
            action: HistoryActionEnum.CREATE,
            [idField]: doc[idField as keyof T] || doc._id,
            snapshot: doc.toObject() as Record<string, any>,
          },
        ],
        { session: doc.$session() ?? undefined },
      );
      logger.log(`History recorded for ${resourceName} CREATE`);
      await mirrorToActivity({
        logger,
        changedBy,
        reason,
        resourceName,
        action: HistoryActionEnum.CREATE,
        resourceId: doc._id,
        resourceRef: referenceOf(doc.toObject() as Record<string, unknown>),
        session: doc.$session() ?? undefined,
      });
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
              reason: context?.reason,
              action: HistoryActionEnum.CREATE,
              [idField]: doc[idField as keyof T] || doc._id,
              snapshot: doc.toObject() as Record<string, any>,
            },
          ],
          { session },
        );
        logger.log(`History recorded for ${resourceName} CREATE (via update)`);
        await mirrorToActivity({
          logger,
          session,
          resourceName,
          changedBy: context?.changedBy,
          reason: context?.reason,
          action: HistoryActionEnum.CREATE,
          resourceId: doc._id,
          resourceRef: referenceOf(doc.toObject() as Record<string, unknown>),
        });
        return next();
      }

      // Track which fields changed
      const update = query.getUpdate() as {
        $set?: Partial<T>;
        $unset?: Record<string, unknown>;
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

      // A field taken away is a field changed. Clearing an order's note is as
      // real an edit as rewriting it, and $unset is the only way to do it — so
      // without this the write would be recorded as touching nothing, or not
      // recorded at all when the clear was the whole edit. A key that was
      // already absent is skipped: removing nothing changed nothing.
      if (update.$unset) {
        for (const key of Object.keys(update.$unset)) {
          const prev = previous[key as keyof T];
          if (prev === undefined || prev === null) continue;
          changedFields[key] = { from: prev, to: null };
        }
      }

      if (!Object.keys(changedFields).length) return next();

      // An edit may name itself something more precise than UPDATE — calling
      // the work off records CANCEL — so a timeline can tell the end of a
      // record's life from ordinary progress. CREATE and DELETE are not up for
      // renaming: those are facts about the write, not readings of it.
      const action =
        context?.action && context.action !== HistoryActionEnum.CREATE
          ? context.action
          : HistoryActionEnum.UPDATE;

      await historyModel.create(
        [
          {
            action,
            changedFields,
            changedBy: context?.changedBy,
            reason: context?.reason,
            [idField]: doc[idField as keyof T] || doc._id,
            snapshot: doc.toObject() as Record<string, any>,
          },
        ],
        { session },
      );

      logger.log(`History recorded for ${resourceName} ${action}`);
      await mirrorToActivity({
        logger,
        action,
        session,
        resourceName,
        changedBy: context?.changedBy,
        reason: context?.reason,
        resourceId: doc._id,
        resourceRef: referenceOf(doc.toObject() as Record<string, unknown>),
      });
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
            reason: context?.reason,
            action: HistoryActionEnum.DELETE,
            [idField]: doc[idField as keyof T] || doc._id,
            snapshot: doc.toObject() as Record<string, any>,
          },
        ],
        { session: sessionOf(query) },
      );

      logger.log(`History recorded for ${resourceName} DELETE`);
      await mirrorToActivity({
        logger,
        resourceName,
        changedBy: context?.changedBy,
        reason: context?.reason,
        action: HistoryActionEnum.DELETE,
        resourceId: doc._id,
        resourceRef: referenceOf(doc.toObject() as Record<string, unknown>),
        session: sessionOf(query),
      });
    } catch (error) {
      logger.error(
        `Failed to save history for ${resourceName} DELETE: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    next();
  });

  return schema;
}
