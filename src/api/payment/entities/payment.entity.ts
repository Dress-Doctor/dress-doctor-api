import { ApiProperty } from '@nestjs/swagger';

export class PaymentEntity {
  @ApiProperty({
    description: 'Payment ID',
    example: '507f1f77bcf86cd799439011',
  })
  _id: string;

  @ApiProperty({
    description: "The payment's human-readable identifier",
    example: 'PY-A4F92C',
  })
  reference: string;

  @ApiProperty({
    description: 'The order the payment settles, resolved to the order itself',
    type: Object,
  })
  orderId: Record<string, unknown>;

  @ApiProperty({
    description: 'Payment method, resolved to the method itself',
    type: Object,
  })
  paymentMethodId: Record<string, unknown>;

  @ApiProperty({
    description: 'Payment type, resolved to the type itself',
    type: Object,
  })
  paymentTypeId: Record<string, unknown>;

  @ApiProperty({
    description: 'Office the payment was taken at, resolved to the office',
    type: Object,
    required: false,
  })
  officeId?: Record<string, unknown>;

  @ApiProperty({
    description: 'Customer who paid, resolved to the user',
    type: Object,
    required: false,
  })
  customerId?: Record<string, unknown>;

  @ApiProperty({
    description: 'Amount paid',
    example: 100.5,
  })
  amount: number;

  @ApiProperty({
    description: 'Staff member who received the payment, resolved to the user',
    type: Object,
    required: false,
  })
  receivedBy?: Record<string, unknown>;

  @ApiProperty({
    description: 'Date and time when payment was made',
    example: '2026-01-04T13:09:58.201Z',
  })
  paidAt: Date;

  @ApiProperty({
    description: 'Transaction reference',
    example: 'TXN123456789',
    required: false,
  })
  transactionRef?: string;

  @ApiProperty({
    description: 'Currency the amount is in, resolved to the currency itself',
    type: Object,
  })
  currencyId: Record<string, unknown>;

  @ApiProperty({
    description: 'Payment note',
    example: 'Payment for order',
    required: false,
  })
  note?: string;

  @ApiProperty({
    description: 'Creation timestamp',
    example: '2026-01-04T13:09:58.201Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Last update timestamp',
    example: '2026-01-04T13:09:58.201Z',
  })
  updatedAt: Date;
}
