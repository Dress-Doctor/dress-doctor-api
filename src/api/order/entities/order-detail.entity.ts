import { ApiProperty } from '@nestjs/swagger';
import { ApiSuccessResponse } from 'src/dto/swagger.dto';
import { HistoryActionEnum } from 'src/schema/admin/admin.dto';
import { OrderCurrencyEntity } from './order-currency.entity';
import { OrderCustomerEntity } from './order-customer.entity';
import { OrderItemEntity } from './order-item.entity';
import { OrderOfficeEntity } from './order-office.entity';

/**
 * One field the audit trail saw change on the order. `from`/`to` are the
 * values exactly as stored; when the field references another document, the
 * readable label is attached beside them rather than replacing them.
 */
export class OrderHistoryChangeEntity {
  @ApiProperty({ example: 'orderStatusId' })
  field: string;

  @ApiProperty({
    example: '6a58eae578ad5f16538aa53d',
    description: 'Value before the change, as stored (any JSON type)',
  })
  from: unknown;

  @ApiProperty({
    example: '6a58eae578ad5f16538aa53e',
    description: 'Value after the change, as stored (any JSON type)',
  })
  to: unknown;

  @ApiProperty({
    required: false,
    example: 'CONFIRMED',
    description:
      'Human-readable name of `from`, present only when the field ' +
      'references another document and that document still exists',
  })
  fromLabel?: string;

  @ApiProperty({
    required: false,
    example: 'RECEIVED',
    description: 'Human-readable name of `to`; see `fromLabel`',
  })
  toLabel?: string;
}

/**
 * One entry of the order's audit trail: what changed, who changed it, when.
 * The stored full-order `snapshot` is deliberately not returned.
 */
export class OrderHistoryEntryEntity {
  @ApiProperty({ example: '64b8c9f1e4b0a2d3c4f5g6h' })
  _id: string;

  @ApiProperty({ enum: HistoryActionEnum, example: HistoryActionEnum.UPDATE })
  action: HistoryActionEnum;

  @ApiProperty({
    type: [OrderHistoryChangeEntity],
    description: 'Empty on CREATE/DELETE entries, which change no field',
  })
  changes: OrderHistoryChangeEntity[];

  @ApiProperty({ example: '64b8c9f1e4b0a2d3c4f5g6h' })
  changedBy: string;

  @ApiProperty({ type: OrderCustomerEntity, required: false })
  changedByUser?: OrderCustomerEntity;

  @ApiProperty({ example: '2026-08-09T09:31:00.000Z' })
  createdAt: string;
}

/** A payment recorded against the order. */
export class OrderPaymentEntity {
  @ApiProperty({ example: '64b8c9f1e4b0a2d3c4f5g6h' })
  _id: string;

  @ApiProperty({ example: 5000, description: 'Integer XAF' })
  amount: number;

  @ApiProperty({ example: 'CURRENT' })
  debtType: string;

  @ApiProperty({ example: '2026-08-08T15:04:00.000Z' })
  paidAt: string;

  @ApiProperty({ required: false, example: 'MOMO-8817263' })
  transactionRef?: string;

  @ApiProperty({
    required: false,
    example: { paymentMethodName: 'MOMO' },
    description: 'The payment method row (name only)',
  })
  paymentMethod?: Record<string, unknown>;

  @ApiProperty({
    required: false,
    example: { paymentTypeName: 'PAYMENT' },
    description: 'The payment type row (name only)',
  })
  paymentType?: Record<string, unknown>;

  @ApiProperty({ type: OrderCustomerEntity, required: false })
  receivedByUser?: OrderCustomerEntity;
}

/**
 * One order with every join a detail screen needs, plus its audit trail.
 * Returned by GET /orders/:orderCode.
 */
export class OrderDetailEntity {
  @ApiProperty({ example: '64b8c9f1e4b0a2d3c4f5g6h' })
  _id: string;

  @ApiProperty({ example: 'OR-000123' })
  orderCode: string;

  @ApiProperty({ example: '64b8c9f1e4b0a2d3c4f5g6h' })
  customerId: string;

  @ApiProperty({ type: OrderCustomerEntity })
  customer: OrderCustomerEntity;

  @ApiProperty({ example: '64b8c9f1e4b0a2d3c4f5g6h', required: false })
  officeId?: string;

  @ApiProperty({ type: OrderOfficeEntity, required: false })
  office?: OrderOfficeEntity;

  @ApiProperty({ example: '64b8c9f1e4b0a2d3c4f5g6h' })
  currencyId: string;

  @ApiProperty({ type: OrderCurrencyEntity })
  currency: OrderCurrencyEntity;

  @ApiProperty({ example: '64b8c9f1e4b0a2d3c4f5g6h' })
  orderStatusId: string;

  @ApiProperty({
    example: { orderStatusName: 'WASHING' },
    description: 'The order status row',
  })
  orderStatus: Record<string, unknown>;

  @ApiProperty({ example: 'PER_PIECE' })
  pricingModel: string;

  @ApiProperty({ required: false, example: 'No starch on the blue shirt' })
  note?: string;

  @ApiProperty({ example: 0 })
  totalWeightKg: number;

  @ApiProperty({ example: 0 })
  fee: number;

  @ApiProperty({ example: 12000 })
  orderAmount: number;

  @ApiProperty({ example: 0 })
  discountAmount: number;

  @ApiProperty({ example: 12000 })
  totalAmount: number;

  @ApiProperty({ example: 5000 })
  amountPaid: number;

  @ApiProperty({ example: 7000 })
  balanceDue: number;

  @ApiProperty({ example: 'PARTIAL' })
  paymentStatus: string;

  @ApiProperty({ example: false })
  flagged: boolean;

  @ApiProperty({ example: '2026-08-08T00:00:00.000Z' })
  receivedAt: string;

  @ApiProperty({ example: '2026-08-10T00:00:00.000Z' })
  estimatedDeliveryDate: string;

  @ApiProperty({ required: false, example: null })
  deliveredAt?: string;

  @ApiProperty({ example: '64b8c9f1e4b0a2d3c4f5g6h' })
  createdBy: string;

  @ApiProperty({ type: OrderCustomerEntity })
  createdByUser: OrderCustomerEntity;

  @ApiProperty({ example: '64b8c9f1e4b0a2d3c4f5g6h' })
  pickedUpBy: string;

  @ApiProperty({ type: OrderCustomerEntity })
  pickedUpByUser: OrderCustomerEntity;

  @ApiProperty({
    type: [OrderItemEntity],
    description:
      'Garment lines, each with its catalog item resolved (item → service, ' +
      'service type, currency)',
  })
  orderItems: OrderItemEntity[];

  @ApiProperty({
    required: false,
    description: 'The pickup request this order came from, with its status',
  })
  pickupRequest?: Record<string, unknown>;

  @ApiProperty({
    required: false,
    description: 'The promo code applied to this order',
  })
  promo?: Record<string, unknown>;

  @ApiProperty({
    required: false,
    description: 'The subscription this order drew quota from',
  })
  subscription?: Record<string, unknown>;

  @ApiProperty({ type: [OrderPaymentEntity] })
  payments: OrderPaymentEntity[];

  @ApiProperty({
    type: [OrderHistoryEntryEntity],
    description: 'Audit trail, newest first, capped at the latest 100 entries',
  })
  history: OrderHistoryEntryEntity[];
}

export class OrderDetailResponseEntity extends ApiSuccessResponse {
  @ApiProperty({ type: OrderDetailEntity })
  data: OrderDetailEntity;
}
