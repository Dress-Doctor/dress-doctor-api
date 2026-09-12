import { ApiProperty } from '@nestjs/swagger';
import { ApiSuccessResponse } from 'src/dto/swagger.dto';
import { PaymentPeriodEnum } from 'src/schema/payment/payment.dto';

/** One field's before/after inside a trail entry. */
export class PaymentHistoryChangeEntity {
  @ApiProperty({ example: 'amount' })
  field: string;

  @ApiProperty({ required: false, example: 500 })
  from?: unknown;

  @ApiProperty({ required: false, example: 850 })
  to?: unknown;

  @ApiProperty({
    required: false,
    example: 'PAYMENT',
    description:
      'Set when the field is a foreign key: the id resolved to something a ' +
      'reader recognises, so a trail never shows a bare ObjectId.',
  })
  fromLabel?: string;

  @ApiProperty({ required: false, example: 'REFUND' })
  toLabel?: string;
}

export class PaymentHistoryEntryEntity {
  @ApiProperty({ example: 'CREATE' })
  action: string;

  @ApiProperty({
    required: false,
    example: 'Customer settled the balance',
    description: 'The `x-change-reason` given with the request that changed it',
  })
  reason?: string;

  @ApiProperty({ type: [PaymentHistoryChangeEntity] })
  changes: PaymentHistoryChangeEntity[];

  @ApiProperty({
    type: Object,
    required: false,
    description: 'Who made the change — safe user fields only',
  })
  changedByUser?: Record<string, unknown>;

  @ApiProperty({ example: '2026-08-08T15:04:00.000Z' })
  createdAt: string;
}

export class PaymentDetailEntity {
  @ApiProperty({ example: '64b8c9f1e4b0a2d3c4f5g6h' })
  _id: string;

  @ApiProperty({ example: 'PY-A4F92C' })
  reference: string;

  @ApiProperty({ example: 5000, description: 'Integer XAF' })
  amount: number;

  @ApiProperty({ enum: PaymentPeriodEnum, example: PaymentPeriodEnum.CURRENT })
  paymentPeriod: PaymentPeriodEnum;

  @ApiProperty({ example: '2026-08-08T15:04:00.000Z' })
  paidAt: string;

  @ApiProperty({ required: false, example: 'MOMO-8817263' })
  transactionRef?: string;

  @ApiProperty({ required: false, example: 'Paid at the counter' })
  note?: string;

  @ApiProperty({
    type: Object,
    description: 'The order this settled, resolved to the order itself',
  })
  orderId: Record<string, unknown>;

  @ApiProperty({
    type: Object,
    required: false,
    description: 'The customer who paid, resolved to the user',
  })
  customerId?: Record<string, unknown>;

  @ApiProperty({
    type: Object,
    required: false,
    description: 'Office the payment was taken at, resolved to the office',
  })
  officeId?: Record<string, unknown>;

  @ApiProperty({
    type: Object,
    required: false,
    description: 'Staff member who received the payment, resolved to the user',
  })
  receivedBy?: Record<string, unknown>;

  @ApiProperty({ type: Object, description: 'Resolved currency' })
  currencyId: Record<string, unknown>;

  @ApiProperty({ type: Object, description: 'Resolved payment type' })
  paymentTypeId: Record<string, unknown>;

  @ApiProperty({ type: Object, description: 'Resolved payment method' })
  paymentMethodId: Record<string, unknown>;

  @ApiProperty({
    type: [PaymentHistoryEntryEntity],
    description:
      'The audit trail, newest first — what changed, by whom and why. The ' +
      'stored full-payment snapshot is never returned.',
  })
  history: PaymentHistoryEntryEntity[];

  @ApiProperty({ example: '2026-08-08T15:04:00.000Z' })
  createdAt: string;

  @ApiProperty({ example: '2026-08-08T15:04:00.000Z' })
  updatedAt: string;
}

export class PaymentDetailResponseEntity extends ApiSuccessResponse {
  @ApiProperty({ type: PaymentDetailEntity })
  data: PaymentDetailEntity;
}
