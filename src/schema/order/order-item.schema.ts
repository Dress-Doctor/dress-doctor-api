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

  // The price of one garment on this line.
  //
  // Set it on the request and it is the agreed price — the counter's figure —
  // and every later reprice feeds it straight back rather than looking the
  // line up in the price list. Leave it out (or 0) and the pricing engine
  // fills it in: Per Piece resolves from the catalog; Per KG / Subscription /
  // Free keep garments for QC at 0.
  //
  // 0 therefore reads as "not agreed", not as "free" — a genuinely free
  // garment is the FREE pricing model or a discount, not a 0 unit price.
  @Prop({ required: true, default: 0 })
  unitPrice: number;

  @Prop({ required: true, default: 0 })
  lineTotal: number;

  // Per-garment quality-control data, and half of what identifies a line:
  // two garments that match on item, service type, condition AND colour are
  // the same thing counted twice, so they collapse into one row with a higher
  // quantity. Differ in either and they stay separate rows, which is what the
  // relaxed index below exists for.
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
