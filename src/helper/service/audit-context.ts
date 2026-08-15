import { Types } from 'mongoose';
import { type AppRequest } from 'src/dto/request-data.dto';
import { HistoryActionEnum } from 'src/schema/admin/admin.dto';
import { type AuditContextDto } from '../mongoose-history.hook';

/**
 * What an audited write tells the history hook about itself: who, why, and —
 * where the plain word "update" would be misleading — what kind of edit it is.
 *
 * Pass it as the `context` option of a `findOneAndUpdate`/`findOneAndDelete`:
 *
 *     await this.orderModel.findOneAndUpdate(filter, update, {
 *       context: auditContext(this.req, userId),
 *       returnDocument: 'after',
 *     } as never);
 *
 * The reason comes off the request (the `x-change-reason` header every
 * mutation carries), so no call site has to remember to plumb it — but it does
 * have to go through here rather than a bare `{ changedBy }`, or the trail
 * records what changed without why.
 */
export function auditContext(
  req: Pick<AppRequest, 'data'>,
  changedBy: Types.ObjectId,
  action?: HistoryActionEnum,
): AuditContextDto {
  return { changedBy, reason: req.data?.reason, action };
}

/**
 * The same, for a create: the hook reads a new document's audit fields off
 * `$locals`, since a `save()` carries no query options.
 */
export function applyAuditLocals<
  T extends { $locals: Record<string, unknown> },
>(doc: T, req: Pick<AppRequest, 'data'>, changedBy: Types.ObjectId): T {
  doc.$locals.changedBy = changedBy;
  doc.$locals.reason = req.data?.reason;
  return doc;
}

/**
 * For writes with no request behind them — seeds, migrations, cron-driven
 * repairs. They still owe the trail an explanation; it just cannot come from
 * a header, so the caller states it outright.
 */
export function systemAuditContext(
  changedBy: Types.ObjectId,
  reason: string,
  action?: HistoryActionEnum,
): AuditContextDto {
  return { changedBy, reason, action };
}
