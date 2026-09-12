import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { HistoryActionEnum } from '../admin/admin.dto';
import { ChangedFieldDto } from '../user/user.dto';
import { User } from '../user/user.schema';
import { OrderStatus } from './order-status.schema';

export const orderStatusHistorySchemaName = 'order_status_history';

/**
 * The audit trail of one order-status row — its description and whether it is
 * still offered.
 *
 * Reference data, but the most consequential kind here: the order state
 * machine is driven by these rows, so switching one off takes it out of every
 * picker while `order.service` still moves orders into it by name. A reader of
 * this trail needs to see who decided that and why.
 */
@Schema({ timestamps: true, collection: orderStatusHistorySchemaName })
export class OrderStatusHistory extends Document<Types.ObjectId> {
  @Prop({
    index: true,
    required: true,
    type: Types.ObjectId,
    ref: OrderStatus.name,
  })
  orderStatusId: Types.ObjectId;

  /**
   * Who made the change. Optional on the schema on purpose: the hook writes
   * whatever the request context carried, and a seed or migration carries no
   * actor — a history row must never be rejected for a missing field, or the
   * audit entry is lost entirely.
   */
  @Prop({ required: false, type: Types.ObjectId, ref: User.name })
  changedBy?: Types.ObjectId;

  @Prop({ required: false, type: Object, default: {} })
  changedFields?: Record<string, ChangedFieldDto>;

  @Prop({ required: true, type: String, enum: HistoryActionEnum })
  action: HistoryActionEnum;

  /**
   * Why the change was made, off the `x-change-reason` header every mutation
   * carries. Optional on the schema on purpose: a history row must never be
   * rejected for a missing field, or the audit entry is lost entirely.
   */
  @Prop({ required: false, trim: true, maxlength: 500 })
  reason?: string;

  @Prop({ required: false, type: Object, default: {} })
  snapshot?: Record<string, any>;
}

export const OrderStatusHistorySchema =
  SchemaFactory.createForClass(OrderStatusHistory);
