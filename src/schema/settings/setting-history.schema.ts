import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { HistoryActionEnum } from '../admin/admin.dto';
import { ChangedFieldDto } from '../user/user.dto';
import { User } from '../user/user.schema';
import { Setting } from './settings.schema';

// Settings drive money (perKgRate, overageRate) — "who changed the rate, when"
// must be answerable in a dispute, so Setting is audited like the other
// mutating domain schemas.
@Schema({ timestamps: true, collection: 'setting_history' })
export class SettingHistory extends Document<Types.ObjectId> {
  @Prop({
    required: true,
    index: true,
    type: Types.ObjectId,
    ref: Setting.name,
  })
  settingId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: User.name })
  changedBy: Types.ObjectId;

  @Prop({ required: false, type: Object, default: {} })
  changedFields?: Record<string, ChangedFieldDto>;

  @Prop({ required: true, type: String, enum: HistoryActionEnum })
  action: HistoryActionEnum;

  @Prop({ required: false, type: Object, default: {} })
  snapshot?: Record<string, any>;
}

export const SettingHistorySchema =
  SchemaFactory.createForClass(SettingHistory);
