import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrderHistory, OrderHistorySchema } from './order-history.schema';
import {
  OrderItemHistory,
  OrderItemHistorySchema,
} from './order-item-history.schema';
import { OrderItem, OrderItemSchema } from './order-item.schema';
import { OrderStatus, OrderStatusSchema } from './order-status.schema';
import { Order, OrderSchema } from './order.schema';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: OrderItem.name, schema: OrderItemSchema },
      { name: OrderStatus.name, schema: OrderStatusSchema },
      { name: OrderHistory.name, schema: OrderHistorySchema },
      { name: OrderItemHistory.name, schema: OrderItemHistorySchema },
    ]),
  ],
  exports: [MongooseModule],
})
export class OrderSchemaModule {}
