import { Types } from 'mongoose';
import { OrderStatusEnum } from 'src/schema/order/order.dto';

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
  changedBy: Types.ObjectId;
}

export interface OrderPaidEvent {
  orderId: Types.ObjectId;
  customerId: Types.ObjectId;
}
