import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, Document } from 'mongoose';
import { User } from '../user/user.schema';
import { PickupRequest } from '../pickup/pickup-request.schema';
import { OrderStatus } from './order-status.schema';
import { Office } from '../office/office.schema';

export const orderSchemaName = 'order';
@Schema({ timestamps: true, collection: orderSchemaName })
export class Order extends Document<Types.ObjectId> {
  @Prop({ required: true, type: Types.ObjectId, ref: Office.name })
  officeId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: User.name })
  customerId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: PickupRequest.name })
  pickupRequestId: Types.ObjectId;

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

  @Prop({ required: true })
  estimatedDeliveryDate: Date;

  @Prop({ required: true, type: Types.ObjectId, ref: OrderStatus.name })
  orderStatusId: Types.ObjectId;
}

export const OrderSchema = SchemaFactory.createForClass(Order);
