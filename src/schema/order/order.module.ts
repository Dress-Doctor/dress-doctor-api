import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrderHistory, OrderHistorySchema } from './order-history.schema';
import {
  OrderItemHistory,
  OrderItemHistorySchema,
} from './order-item-history.schema';
import {
  OrderItemServiceType,
  OrderItemServiceTypeSchema,
} from './order-item-service-type.schema';
import { OrderItemType, OrderItemTypeSchema } from './order-item-type.schema';
import { OrderItem, OrderItemSchema } from './order-item.schema';
import { OrderStatus, OrderStatusSchema } from './order-status.schema';
import { Order, OrderSchema } from './order.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: OrderItem.name, schema: OrderItemSchema },
      { name: OrderStatus.name, schema: OrderStatusSchema },
      { name: OrderHistory.name, schema: OrderHistorySchema },
      { name: OrderItemType.name, schema: OrderItemTypeSchema },
      { name: OrderItemHistory.name, schema: OrderItemHistorySchema },
      { name: OrderItemServiceType.name, schema: OrderItemServiceTypeSchema },
    ]),
  ],
  exports: [MongooseModule],
})
export class OrderSchemaModule {}
