import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, Document } from 'mongoose';
import { OrderItemType } from './order-item-type.schema';
import { OrderItemServiceType } from './order-item-service-type.schema';

export const oderItemSchemaName = 'order_item';
@Schema({ timestamps: true, collection: oderItemSchemaName })
export class OrderItem extends Document<Types.ObjectId> {
  @Prop({ required: true, type: Types.ObjectId, ref: OrderItemType.name })
  orderItemTypeId: Types.ObjectId;

  @Prop({
    required: true,
    type: Types.ObjectId,
    ref: OrderItemServiceType.name,
  })
  orderItemServiceTypeId: Types.ObjectId;

  @Prop({ required: true, default: 2 })
  estimatedDeliveryTimeline: number; // signifying the number of days

  @Prop({ required: true })
  quantity: number;

  @Prop({ required: true })
  unitPrice: number;
}

export const OrderItemSchema = SchemaFactory.createForClass(OrderItem);
