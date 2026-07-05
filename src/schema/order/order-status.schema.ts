import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export const orderStatusSchemaName = 'order_status';
@Schema({ timestamps: true, collection: orderStatusSchemaName })
export class OrderStatus extends Document<Types.ObjectId> {
  @Prop({ required: true, unique: true })
  orderStatusName: string; // RECEIVED, READY, WASHING, DELIVERED

  @Prop({ required: false })
  description?: string;

  @Prop({ required: true, default: true })
  isActive: boolean;
}

export const OrderStatusSchema = SchemaFactory.createForClass(OrderStatus);
