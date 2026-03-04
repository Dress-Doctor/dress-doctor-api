import { Global, Module } from '@nestjs/common';
import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { attachHistoryHooks } from 'src/helper/mongoose-history.hook';
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
    MongooseModule.forFeatureAsync([
      {
        name: Order.name,
        inject: [getModelToken(OrderHistory.name)],
        useFactory: (historyModel: Model<OrderHistory>) => {
          const schema = OrderSchema;

          return attachHistoryHooks({
            schema,
            historyModel,
            idField: 'orderId',
            resourceName: Order.name,
          });
        },
      },

      {
        name: OrderItem.name,
        inject: [getModelToken(OrderItemHistory.name)],
        useFactory: (historyModel: Model<OrderItemHistory>) => {
          const schema = OrderItemSchema;
          return attachHistoryHooks({
            schema,
            historyModel,
            idField: 'orderItemId',
            resourceName: OrderItem.name,
          });
        },
      },
    ]),
    MongooseModule.forFeature([
      { name: OrderStatus.name, schema: OrderStatusSchema },
      { name: OrderHistory.name, schema: OrderHistorySchema },
      { name: OrderItemHistory.name, schema: OrderItemHistorySchema },
    ]),
  ],
  exports: [MongooseModule],
})
export class OrderSchemaModule {}
