import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { HistoryActionEnum } from '../admin/admin.dto';
import { ChangedFieldDto } from '../user/user.dto';
import { Office } from './office.schema';

export const officeHistorySchemaName = 'office_history';

/**
 * The audit trail of one office document — name, type, address, status and
 * the public link. Staff assignments have their own trail
 * (`office_user_history`); the office detail page merges the two.
 */
@Schema({ timestamps: true, collection: officeHistorySchemaName })
export class OfficeHistory extends Document<Types.ObjectId> {
  @Prop({ required: true, index: true, type: Types.ObjectId, ref: Office.name })
  officeId: Types.ObjectId;

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

export const OfficeHistorySchema = SchemaFactory.createForClass(OfficeHistory);
