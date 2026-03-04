import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { HistoryActionEnum } from '../admin/admin.dto';
import { ChangedFieldDto } from '../user/user.dto';
import { User } from '../user/user.schema';
import { PromoCodeUsage } from './promo-code-usage.schema';

export const promoCodeUsageHistorySchemaName = 'promo_code_usage_history';
@Schema({ timestamps: true, collection: promoCodeUsageHistorySchemaName })
export class PromoCodeUsageHistory extends Document<Types.ObjectId> {
  @Prop({
    index: true,
    required: true,
    type: Types.ObjectId,
    ref: PromoCodeUsage.name,
  })
  promoCodeUsageId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: User.name })
  changedBy: Types.ObjectId;

  @Prop({ required: false, type: Object, default: {} })
  changedFields?: Record<string, ChangedFieldDto>;

  @Prop({ required: true, enum: HistoryActionEnum })
  action: HistoryActionEnum;

  @Prop({ required: false, type: Object, default: {} })
  snapshot?: Record<string, any>;
}

export const PromoCodeUsageHistorySchema = SchemaFactory.createForClass(
  PromoCodeUsageHistory,
);
