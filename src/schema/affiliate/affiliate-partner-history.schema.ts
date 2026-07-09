import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { ChangedFieldDto } from '../user/user.dto';
import { User } from '../user/user.schema';
import { AffiliatePartner } from './affiliate-partner.schema';
import { HistoryActionEnum } from '../admin/admin.dto';

export const affiliatePartnerHistorySchemaName = 'affiliate_partner_history';
@Schema({ timestamps: true, collection: affiliatePartnerHistorySchemaName })
export class AffiliatePartnerHistory extends Document<Types.ObjectId> {
  @Prop({
    index: true,
    required: true,
    type: Types.ObjectId,
    ref: AffiliatePartner.name,
  })
  affiliatePartnerId: Types.ObjectId;

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

  @Prop({ required: true, type: String, enum: HistoryActionEnum })
  action: HistoryActionEnum;

  @Prop({ required: false, type: Object, default: {} })
  snapshot?: Record<string, any>;
}

export const AffiliatePartnerHistorySchema = SchemaFactory.createForClass(
  AffiliatePartnerHistory,
);
