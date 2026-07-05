import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { AffiliatePartner } from './affiliate-partner.schema';

export const affiliatePartnerBalanceHistorySchemaName =
  'affiliate_partner_balance_history';
@Schema({
  timestamps: true,
  collection: affiliatePartnerBalanceHistorySchemaName,
})
export class AffiliatePartnerBalanceHistory extends Document<Types.ObjectId> {
  @Prop({ required: true, type: Types.ObjectId, ref: AffiliatePartner.name })
  affiliatePartnerId: Types.ObjectId;

  @Prop({ required: true })
  openingBalance: number;

  @Prop({ required: true })
  closingBalance: number;
}

export const AffiliatePartnerBalanceHistorySchema =
  SchemaFactory.createForClass(AffiliatePartnerBalanceHistory);
