import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { HistoryActionEnum } from '../admin/admin.dto';
import { ChangedFieldDto } from './user.dto';
import { User } from './user.schema';

export const userHistorySchemaName = 'user_history';
@Schema({ timestamps: true, collection: userHistorySchemaName })
export class UserHistory extends Document<Types.ObjectId> {
  @Prop({ required: true, index: true, type: Types.ObjectId, ref: User.name })
  userId: Types.ObjectId;

  /**
   * Who made the change, off the audit context every mutating write carries.
   *
   * Optional on the schema, like `reason` below: a write with no person behind
   * it — a seed, a cron-driven repair, a fixture — still owes the trail an
   * entry. The hook swallows its own save errors by design, so a required
   * field here would not reject the write; it would only make the audit row
   * disappear without a sound.
   */
  @Prop({ required: false, type: Types.ObjectId, ref: User.name })
  changedBy?: Types.ObjectId;

  @Prop({ required: false, type: Object, default: {} })
  changedFields?: Record<string, ChangedFieldDto>;

  @Prop({ required: true, type: String, enum: HistoryActionEnum })
  action: HistoryActionEnum;

  /**
   * Why the change was made. Required of every mutating request through the
   * `x-change-reason` header, so a trail never says only what changed. Kept
   * optional on the schema on purpose: a history row must never be rejected
   * for a missing field, or the audit entry is lost entirely.
   */
  @Prop({ required: false, trim: true, maxlength: 500 })
  reason?: string;

  @Prop({ required: false, type: Object, default: {} })
  snapshot?: Record<string, any>;
}

export const UserHistorySchema = SchemaFactory.createForClass(UserHistory);
