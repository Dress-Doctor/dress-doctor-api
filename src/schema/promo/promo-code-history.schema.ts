import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { HistoryActionEnum } from '../admin/admin.dto';
import { PromoCode } from '../promo/promo-code.schema';
import { ChangedFieldDto } from '../user/user.dto';
import { User } from '../user/user.schema';

export const promoCodeHistorySchemaName = 'promo_code_history';
@Schema({ timestamps: true, collection: promoCodeHistorySchemaName })
export class PromoCodeHistory extends Document<Types.ObjectId> {
  @Prop({
    required: true,
    index: true,
    type: Types.ObjectId,
    ref: PromoCode.name,
  })
  promoCodeId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: User.name })
  changedBy: Types.ObjectId;

  @Prop({ required: false, type: Object, default: {} })
  changedFields?: Record<string, ChangedFieldDto>;

  @Prop({ required: true, type: String, enum: HistoryActionEnum })
  action: HistoryActionEnum;

  @Prop({ required: false, type: Object, default: {} })
  snapshot?: Record<string, any>;
}

export const PromoCodeHistorySchema =
  SchemaFactory.createForClass(PromoCodeHistory);
