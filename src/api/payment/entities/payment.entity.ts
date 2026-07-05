import { ApiProperty } from '@nestjs/swagger';

export class PaymentEntity {
  @ApiProperty({
    description: 'Payment ID',
    example: '507f1f77bcf86cd799439011',
  })
  _id: string;

  @ApiProperty({
    description: 'Order ID',
    example: '507f1f77bcf86cd799439011',
  })
  orderId: string;

  @ApiProperty({
    description: 'Payment method ID',
    example: '507f1f77bcf86cd799439011',
  })
  paymentMethodId: string;

  @ApiProperty({
    description: 'Payment status ID',
    example: '507f1f77bcf86cd799439011',
  })
  paymentStatusId: string;

  @ApiProperty({
    description: 'Amount paid',
    example: 100.5,
  })
  amount: number;

  @ApiProperty({
    description: 'User who received the payment',
    example: '507f1f77bcf86cd799439011',
    required: false,
  })
  receivedBy?: string;

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
    description: 'Currency ID',
    example: '507f1f77bcf86cd799439011',
  })
  currencyId: string;

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

  @ApiProperty({
    required: true,
    example: 'REFUND',
    description: 'Payment type',
  })
  paymentType: string;
}
