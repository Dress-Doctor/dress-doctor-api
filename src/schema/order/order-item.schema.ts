import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, Document } from 'mongoose';
import { Order } from './order.schema';
import { Item } from '../catalog/item.schema';

export const orderItemSchemaName = 'order_item';
@Schema({ timestamps: true, collection: orderItemSchemaName })
export class OrderItem extends Document<Types.ObjectId> {
  @Prop({ required: true, type: Types.ObjectId, ref: Order.name })
  orderId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: Item.name })
  itemId: Types.ObjectId;

  @Prop({ required: true })
  quantity: number;

  @Prop({ required: true })
  unitPrice: number;
}

export const OrderItemSchema = SchemaFactory.createForClass(OrderItem);
OrderItemSchema.index({ orderId: 1, itemId: 1 }, { unique: true });
