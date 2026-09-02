import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { HistoryActionEnum } from '../admin/admin.dto';
import { ChangedFieldDto } from '../user/user.dto';
import { User } from '../user/user.schema';
import { OfficeUser } from './office-user.schema';

export const officeUserHistorySchemaName = 'office_user_history';
@Schema({ timestamps: true, collection: officeUserHistorySchemaName })
export class OfficeUserHistory extends Document<Types.ObjectId> {
  @Prop({ required: true, type: Types.ObjectId, ref: OfficeUser.name })
  officeUserId: Types.ObjectId;

  /**
   * The staff member the assignment is about. Optional so a history row is
   * never rejected for a missing field — the trail is written by a post-save
   * hook that only knows the assignment's own `_id`, and the snapshot below
   * carries the user either way.
   */
  @Prop({ required: false, index: true, type: Types.ObjectId, ref: User.name })
  userId?: Types.ObjectId;

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

export const OfficeUserHistorySchema =
  SchemaFactory.createForClass(OfficeUserHistory);
