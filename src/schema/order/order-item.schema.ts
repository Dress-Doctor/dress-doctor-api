import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, Document } from 'mongoose';
import { Order } from './order.schema';
import { Item } from '../catalog/item.schema';
import { ServiceType } from '../catalog/service-type.schema';
import { OrderItemConditionEnum } from './order.dto';

export const orderItemSchemaName = 'order_item';
@Schema({ timestamps: true, collection: orderItemSchemaName })
export class OrderItem extends Document<Types.ObjectId> {
  @Prop({ required: true, type: Types.ObjectId, ref: Order.name })
  orderId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: Item.name })
  itemId: Types.ObjectId;

  // The wash service type for this line — drives Per Piece pricing.
  @Prop({ required: true, type: Types.ObjectId, ref: ServiceType.name })
  serviceTypeId: Types.ObjectId;

  @Prop({ required: true })
  quantity: number;

  // Snapshotted by the pricing engine at reprice: Per Piece resolves from the
  // catalog; Per KG / Subscription / Free keep garments for QC at 0.
  @Prop({ required: true, default: 0 })
  unitPrice: number;

  @Prop({ required: true, default: 0 })
  lineTotal: number;

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
