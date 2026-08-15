import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { HistoryActionEnum } from '../admin/admin.dto';
import { ChangedFieldDto } from '../user/user.dto';
import { User } from '../user/user.schema';
import { OrderItem } from './order-item.schema';

export const oderItemHistorySchemaName = 'order_item_history';
@Schema({ timestamps: true, collection: oderItemHistorySchemaName })
export class OrderItemHistory extends Document<Types.ObjectId> {
  @Prop({
    index: true,
    required: true,
    type: Types.ObjectId,
    ref: OrderItem.name,
  })
  orderItemId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: User.name })
  changedBy: Types.ObjectId;

  @Prop({ required: false, type: Object, default: {} })
  changedFields?: Record<string, ChangedFieldDto>;

  @Prop({ required: true, type: String, enum: HistoryActionEnum })
  action: HistoryActionEnum;

  /**
   * Why the change was made. Required of every mutating request through the
   * `x-change-reason` header, so a trail never says only what changed. Kept
   * optional on the schema on purpose: a history row must never be rejected
   * for a missing field, or the audit entry is lost entirely.
   */
  @Prop({ required: false, trim: true, maxlength: 500 })
  reason?: string;

  @Prop({ required: false, type: Object, default: {} })
  snapshot?: Record<string, any>;
}

export const OrderItemHistorySchema =
  SchemaFactory.createForClass(OrderItemHistory);

/**
 * An order's whole garment trail is read through the snapshot's `orderId`,
 * not through `orderItemId`: a removed line's row is deleted outright, so the
 * ids that survive on the order no longer address its own history.
 */
OrderItemHistorySchema.index({ 'snapshot.orderId': 1, createdAt: -1 });
