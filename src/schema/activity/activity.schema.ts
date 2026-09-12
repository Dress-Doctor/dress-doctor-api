import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Office } from '../office/office.schema';
import { User } from '../user/user.schema';
import { ActivityKindEnum, ActivityOutcomeEnum } from './activity.dto';

export const activitySchemaName = 'activity';

/**
 * One row per thing a user did, denormalized so the whole trail can be read
 * by actor in a single query.
 *
 * This does NOT replace the per-record `*_history` collections: those answer
 * "what happened to this order, field by field", and remain the authority on
 * what a value changed from and to. This answers the other question — "what
 * did this person do while they were on the platform" — which the history
 * tables cannot answer without a 26-way fan-out, and which they cannot answer
 * at all for the things that change no record: signing in, exporting a file.
 *
 * Rows are append-only. Nothing edits one, so there is no history-of-history
 * and no `BaseSchema` soft-delete: an audit row that can be quietly switched
 * off is not an audit row.
 */
@Schema({ timestamps: true, collection: activitySchemaName })
export class Activity extends Document<Types.ObjectId> {
  @Prop({ required: true, type: Types.ObjectId, ref: User.name })
  userId: Types.ObjectId;

  /**
   * The office the actor was operating in, copied off the request. Null for
   * customers (not office-owned) and for system writes. Stored rather than
   * joined, because the office a person belonged to at the time is part of
   * what happened — reassigning them later must not rewrite the past.
   */
  @Prop({ required: false, type: Types.ObjectId, ref: Office.name })
  officeId?: Types.ObjectId;

  @Prop({ required: true, type: String, enum: ActivityKindEnum })
  kind: ActivityKindEnum;

  /** `resource.verb`, matching the domain event convention: `order.create`. */
  @Prop({ required: true, trim: true })
  action: string;

  /** The schema class name the action touched, e.g. `Order`. */
  @Prop({ required: true, trim: true })
  resource: string;

  @Prop({ required: false, type: Types.ObjectId })
  resourceId?: Types.ObjectId;

  /**
   * The human reference of the record — `OR-4B2C`, `CU-9F13`. Copied at write
   * time so a trail reads without a join, and still reads after the record
   * itself is gone.
   */
  @Prop({ required: false, trim: true })
  resourceRef?: string;

  @Prop({
    required: true,
    type: String,
    default: ActivityOutcomeEnum.SUCCESS,
    enum: ActivityOutcomeEnum,
  })
  outcome: ActivityOutcomeEnum;

  /** The `x-change-reason` the actor gave, for the writes that carry one. */
  @Prop({ required: false, trim: true, maxlength: 500 })
  reason?: string;

  /** Ties a row back to the request line in the logs, and to its siblings. */
  @Prop({ required: false, trim: true })
  requestId?: string;

  /** Which frontend the call came through — the api client's name. */
  @Prop({ required: false, trim: true })
  platform?: string;

  @Prop({ required: false, trim: true })
  ip?: string;

  @Prop({ required: false, trim: true, maxlength: 500 })
  userAgent?: string;

  /**
   * Why a FAILURE failed, or the few fields that make an EXPORT legible (row
   * count, filters). Small by contract: this is a trail, not a copy of the
   * record — the snapshot on the history row is where the full document is.
   */
  @Prop({ required: false, type: Object, default: {} })
  metadata?: Record<string, unknown>;
}

export const ActivitySchema = SchemaFactory.createForClass(Activity);

// The reason this collection exists: everything one person did, newest first.
ActivitySchema.index({ userId: 1, createdAt: -1 });
// The same question asked of a branch — "what happened at Bonapriso today".
ActivitySchema.index({ officeId: 1, createdAt: -1 });
// "Who touched this order?", the reverse of the per-record history read.
ActivitySchema.index({ resource: 1, resourceId: 1, createdAt: -1 });
// Filtering a review down to one kind of act: every export, every failed login.
ActivitySchema.index({ kind: 1, action: 1, createdAt: -1 });

/**
 * Retention. These rows carry who-did-what on real customers, so they are
 * kept deliberately rather than forever: Mongo drops one once it is older
 * than ACTIVITY_RETENTION_DAYS (default 2 years).
 *
 * A TTL index stores its expiry at creation time, so editing the env alone
 * will NOT move an existing collection's horizon — that needs a `collMod`
 * on `expireAfterSeconds`, which belongs in a migration.
 */
const retentionDays = Number(process.env.ACTIVITY_RETENTION_DAYS ?? 730);
ActivitySchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: retentionDays * 24 * 60 * 60 },
);
