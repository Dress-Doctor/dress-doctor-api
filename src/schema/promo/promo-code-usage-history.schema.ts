import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { ChangedFieldDto } from '../user/user.dto';
import { User } from '../user/user.schema';
import { PromoCodeUsage } from './promo-code-usage.schema';
import { ActionEnum } from '../admin/admin.dto';

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

  @Prop({
    required: false,
    type: [
      {
        field: String,
        to: MongooseSchema.Types.Mixed,
        from: MongooseSchema.Types.Mixed,
      },
    ],
    default: [],
  })
  changedFields?: ChangedFieldDto[];

  @Prop({ required: true, enum: ActionEnum })
  action: ActionEnum;

  @Prop({ required: false, type: Object, default: {} })
  snapshot?: Record<string, any>;
}

export const PromoCodeUsageHistorySchema = SchemaFactory.createForClass(
  PromoCodeUsageHistory,
);
