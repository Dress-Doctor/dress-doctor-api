import { ApiProperty } from '@nestjs/swagger';
import { OrderCurrencyEntity } from './order-currency.entity';
import { OrderCustomerEntity } from './order-customer.entity';
import { OrderItemEntity } from './order-item.entity';
import { OrderOfficeEntity } from './order-office.entity';
import { OrderPickupEntity } from './order-pickup.entity';

export class OrderWithItemsEntity {
  @ApiProperty({ example: '64b8c9f1e4b0a2d3c4f5g6h' })
  _id: string;

  @ApiProperty({ example: '64b8c9f1e4b0a2d3c4f5g6h' })
  customerId: string;

  @ApiProperty({ type: OrderCustomerEntity })
  customer: OrderCustomerEntity;

  @ApiProperty({ example: '64b8c9f1e4b0a2d3c4f5g6h' })
  currencyId: string;

  @ApiProperty({ type: OrderCurrencyEntity })
  currency: OrderCurrencyEntity;

  @ApiProperty({ example: '64b8c9f1e4b0a2d3c4f5g6h', required: false })
  officeId?: string;

  @ApiProperty({ type: OrderOfficeEntity, required: false })
  office?: OrderOfficeEntity;

  @ApiProperty({ example: '64b8c9f1e4b0a2d3c4f5g6h' })
  pickupRequestId: string;

  @ApiProperty({
    required: false,
    type: OrderPickupEntity,
    description:
      'The pickup request this order came from, with its status. Absent on ' +
      'orders taken over the counter.',
  })
  pickupRequest?: OrderPickupEntity;

  @ApiProperty({ example: 'ORD-0001' })
  orderCode: string;

  @ApiProperty({
    required: false,
    description: 'Anything specific the customer told us about this order',
    example: 'No starch on the blue shirt; collar stain on the white one.',
  })
  note?: string;

  @ApiProperty({ example: 0 })
  fee: number;

  @ApiProperty({ example: 0 })
  orderAmount: number;

  @ApiProperty({ example: 0 })
  discountAmount: number;

  @ApiProperty({ example: 0 })
  totalAmount: number;

  @ApiProperty({
    example: '2026-03-08T00:00:00.000Z',
    description: 'Business date the laundry was received',
  })
  receivedAt: string;

  @ApiProperty({ example: '2026-03-10T00:00:00.000Z' })
  estimatedDeliveryDate: string;

  @ApiProperty({
    required: false,
    example: '2026-03-11T00:00:00.000Z',
    description: 'Actual delivery date (set on DELIVERED); null until then',
  })
  deliveredAt?: string;

  @ApiProperty({
    example: '64b8c9f1e4b0a2d3c4f5g6h',
    description: 'User who created the order',
  })
  createdBy: string;

  @ApiProperty({ type: OrderCustomerEntity })
  createdByUser: OrderCustomerEntity;

  @ApiProperty({
    example: '64b8c9f1e4b0a2d3c4f5g6h',
    description: 'Agent who picked up the laundry (defaults to createdBy)',
  })
  pickedUpBy: string;

  @ApiProperty({ type: OrderCustomerEntity })
  pickedUpByUser: OrderCustomerEntity;

  @ApiProperty({ example: '64b8c9f1e4b0a2d3c4f5g6h' })
  orderStatusId: string;

  @ApiProperty({ type: [OrderItemEntity] })
  items: OrderItemEntity[];
}
