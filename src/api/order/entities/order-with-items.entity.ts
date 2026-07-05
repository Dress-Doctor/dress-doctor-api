import { ApiProperty } from '@nestjs/swagger';
import { OrderItemEntity } from './order-item.entity';

export class OrderWithItemsEntity {
  @ApiProperty({ example: '64b8c9f1e4b0a2d3c4f5g6h' })
  _id: string;

  @ApiProperty({ example: '64b8c9f1e4b0a2d3c4f5g6h' })
  customerId: string;

  @ApiProperty({ example: '64b8c9f1e4b0a2d3c4f5g6h' })
  currencyId: string;

  @ApiProperty({ example: '64b8c9f1e4b0a2d3c4f5g6h' })
  pickupRequestId: string;

  @ApiProperty({ example: 'ORD-0001' })
  orderCode: string;

  @ApiProperty({ example: 0 })
  fee: number;

  @ApiProperty({ example: 0 })
  orderAmount: number;

  @ApiProperty({ example: 0 })
  discountAmount: number;

  @ApiProperty({ example: 0 })
  totalAmount: number;

  @ApiProperty({ example: '2026-03-10T00:00:00.000Z' })
  estimatedDeliveryDate: string;

  @ApiProperty({ example: '64b8c9f1e4b0a2d3c4f5g6h' })
  orderStatusId: string;

  @ApiProperty({ type: [OrderItemEntity] })
  items: OrderItemEntity[];
}
