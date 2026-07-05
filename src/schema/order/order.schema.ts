import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { PickupRequest } from '../pickup/pickup-request.schema';
import { OrderStatus } from './order-status.schema';
import { Currency } from '../catalog/currency.schema';
import { User } from '../user/user.schema';
import { OrderPaymentStatusEnum } from './order.dto';

export const orderSchemaName = 'order';
@Schema({ timestamps: true, collection: orderSchemaName })
export class Order extends Document<Types.ObjectId> {
  @Prop({ required: true, type: Types.ObjectId, ref: User.name })
  customerId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: Currency.name })
  currencyId: Types.ObjectId;

  @Prop({ required: false, type: Types.ObjectId, ref: PickupRequest.name })
  pickupRequestId?: Types.ObjectId;

  @Prop({ required: true, unique: true })
  orderCode: string;

  @Prop({ required: true, default: 0 })
  fee: number;

  @Prop({ required: true, default: 0 })
  orderAmount: number;

  @Prop({ required: true, default: 0 })
  discountAmount: number;

  @Prop({ required: true, default: 0 })
  totalAmount: number;

  @Prop({ required: true, default: 0 })
  amountPaid: number;

  @Prop({ required: true, default: 0 })
  balanceDue: number;

  @Prop({
    type: String,
    required: true,
    default: 'UNPAID',
    enum: OrderPaymentStatusEnum,
  })
  paymentStatus: OrderPaymentStatusEnum;

  @Prop({ required: true })
  estimatedDeliveryDate: Date;

  @Prop({ required: true, type: Types.ObjectId, ref: OrderStatus.name })
  orderStatusId: Types.ObjectId;
}

export const OrderSchema = SchemaFactory.createForClass(Order);
OrderSchema.index(
  { pickupRequestId: 1, customerId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      pickupRequestId: { $exists: true, $ne: null },
    },
  },
);
