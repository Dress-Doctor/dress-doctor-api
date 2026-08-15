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

export const AffiliatePartnerHistorySchema = SchemaFactory.createForClass(
  AffiliatePartnerHistory,
);
