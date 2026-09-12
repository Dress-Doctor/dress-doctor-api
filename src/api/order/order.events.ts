import { Types } from 'mongoose';
import { OrderStatusEnum } from 'src/schema/order/order.dto';
import { type TransitionKindEnum } from './order.service';

/** Domain event names (resource.verb). Listeners land in Phase 2 (notifications). */
export const OrderEvents = {
  created: 'order.created',
  statusChanged: 'order.status_changed',
  paid: 'order.paid',
} as const;

export interface OrderCreatedEvent {
  orderId: Types.ObjectId;
  customerId: Types.ObjectId;
  changedBy: Types.ObjectId;
}

export interface OrderStatusChangedEvent {
  orderId: Types.ObjectId;
  from: OrderStatusEnum;
  to: OrderStatusEnum;
  /**
   * Whether the order moved along its lifecycle or was cancelled. Listeners
   * that speak to the customer care: `from` and `to` say which way it went,
   * and a move backwards is a correction of the record, not news to announce.
   */
  kind: TransitionKindEnum;
  changedBy: Types.ObjectId;
}

export interface OrderPaidEvent {
  orderId: Types.ObjectId;
  customerId: Types.ObjectId;
}
