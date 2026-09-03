import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { HistoryActionEnum } from '../admin/admin.dto';
import { ChangedFieldDto } from './user.dto';
import { UserType } from './user-type.schema';

export const userTypeHistorySchemaName = 'user_type_history';

/**
 * The audit trail of one user-type row — its name, description and status.
 *
 * User types are reference data: short lists that decide what a person is
 * allowed to be. Renaming or deactivating one changes what the rest of the
 * platform means, so every edit is recorded here and shown on the reference
 * detail panel.
 */
@Schema({ timestamps: true, collection: userTypeHistorySchemaName })
export class UserTypeHistory extends Document<Types.ObjectId> {
  @Prop({
    index: true,
    required: true,
    type: Types.ObjectId,
    ref: UserType.name,
  })
  userTypeId: Types.ObjectId;

  @Prop({ required: false, type: Object, default: {} })
  changedFields?: Record<string, ChangedFieldDto>;

  @Prop({ required: true, type: String, enum: HistoryActionEnum })
  action: HistoryActionEnum;

  /**
   * Why the change was made, off the `x-change-reason` header every mutation
   * carries. Optional on the schema on purpose: a history row must never be
   * rejected for a missing field, or the audit entry is lost entirely.
   */
  @Prop({ required: false, trim: true, maxlength: 500 })
  reason?: string;

  @Prop({ required: false, type: Object, default: {} })
  snapshot?: Record<string, any>;
}

export const UserTypeHistorySchema =
  SchemaFactory.createForClass(UserTypeHistory);
