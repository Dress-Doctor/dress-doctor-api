import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, Document } from 'mongoose';

export const orderItemServiceTypeSchemaName = 'order_item_service_type';
@Schema({ timestamps: true, collection: orderItemServiceTypeSchemaName })
export class OrderItemServiceType extends Document<Types.ObjectId> {
  @Prop({ required: true })
  orderItemServiceTypeName: string; // WASH, DRY CLEANING

  @Prop({ required: false })
  description?: string;

  @Prop({ required: true, default: true })
  isActive: boolean;
}

export const OrderItemServiceTypeSchema =
  SchemaFactory.createForClass(OrderItemServiceType);
