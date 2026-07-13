import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, Document } from 'mongoose';
import { Order } from './order.schema';
import { Item } from '../catalog/item.schema';
import { OrderItemConditionEnum } from './order.dto';

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

  // Per-garment quality-control data. Each physical garment is its own
  // row (see the relaxed index below), so condition + colour survive
  // rather than being flattened into an aggregated qty.
  @Prop({
    required: true,
    type: String,
    enum: OrderItemConditionEnum,
    default: OrderItemConditionEnum.NORMAL,
  })
  condition: OrderItemConditionEnum;

  @Prop({ required: false })
  colour?: string;
}

export const OrderItemSchema = SchemaFactory.createForClass(OrderItem);
// Relaxed from unique (orderId,itemId): per-garment rows mean the same
// item can appear multiple times in one order with different
// condition/colour. Existing deployments must drop the old
// orderId_1_itemId_1 unique index (see PHASE-1-REPORT migration note).
OrderItemSchema.index({ orderId: 1 });
