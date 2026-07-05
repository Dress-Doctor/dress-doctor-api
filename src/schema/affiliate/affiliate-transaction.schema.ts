import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, Document } from 'mongoose';
import { User } from '../user/user.schema';
import { Order } from '../order/order.schema';

export const affiliateTransactionSchemaName = 'affiliate_transaction';
@Schema({ timestamps: true, collection: affiliateTransactionSchemaName })
export class AffiliateTransaction extends Document<Types.ObjectId> {
  @Prop({ required: true, type: Types.ObjectId, ref: User.name })
  affiliateId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: Order.name })
  orderId: Types.ObjectId;

  @Prop({ required: true, default: 0 })
  commissionAmount: number;

  @Prop({ required: true, default: 0 })
  rewardValue: number;

  @Prop({ required: true, default: 0 })
  totalEarning: number;
}

export const AffiliateTransactionSchema =
  SchemaFactory.createForClass(AffiliateTransaction);
