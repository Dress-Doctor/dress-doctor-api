import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Currency } from '../catalog/currency.schema';
import { Order } from '../order/order.schema';
import { User } from '../user/user.schema';
import { PaymentMethod } from './payment-method.schema';
import { PaymentType } from './payment-type.schema';

export const paymentSchemaName = 'payment';
@Schema({ timestamps: true, collection: paymentSchemaName })
export class Payment extends Document<Types.ObjectId> {
  @Prop({ required: true, type: Types.ObjectId, ref: Order.name })
  orderId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: PaymentMethod.name })
  paymentMethodId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: PaymentType.name })
  paymentTypeId: Types.ObjectId;

  @Prop({ required: true })
  amount: number;

  @Prop({ type: Types.ObjectId, ref: User.name })
  receivedBy: Types.ObjectId;

  @Prop({ required: true })
  paidAt: Date;

  @Prop({ required: false })
  transactionRef?: string;

  @Prop({ required: true, type: Types.ObjectId, ref: Currency.name })
  currencyId: Types.ObjectId;

  @Prop({ required: false })
  note?: string;
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);
