import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, Document } from 'mongoose';

export const orderItemTypeSchemaName = 'order_item_type';
@Schema({ timestamps: true, collection: orderItemTypeSchemaName })
export class OrderItemType extends Document<Types.ObjectId> {
  @Prop({ required: true })
  orderItemTypeName: string; // SHIRT

  @Prop({ required: false })
  description?: string;

  @Prop({ required: true, default: true })
  isActive: boolean;
}

export const OrderItemTypeSchema = SchemaFactory.createForClass(OrderItemType);
