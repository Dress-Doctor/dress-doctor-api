import { ApiProperty } from '@nestjs/swagger';
import { ApiSuccessResponse } from 'src/dto/swagger.dto';

export class PaymentTypeBreakdownEntity {
  @ApiProperty({ example: 121, description: 'Records taking money in' })
  payment: number;

  @ApiProperty({ example: 7, description: 'Records paying money back' })
  refund: number;
}

export class PaymentKpiDataEntity {
  @ApiProperty({
    example: 1450000,
    description:
      'Net of every matched payment, in integer XAF: refunds subtract rather ' +
      'than add. Narrow with `paymentType` for one side on its own.',
  })
  totalAmount: number;

  @ApiProperty({
    example: 128,
    description:
      'How many payment records matched, refunds included — a count, not an ' +
      'amount, and the one figure here a refund adds to.',
  })
  totalPayments: number;

  @ApiProperty({
    example: 1180000,
    description: "Net of the payments booked to their order's own month",
  })
  totalCurrent: number;

  @ApiProperty({
    example: 270000,
    description:
      "Net of the payments clearing an earlier month's balance — the money " +
      'that came in late',
  })
  totalPrior: number;

  @ApiProperty({
    type: PaymentTypeBreakdownEntity,
    description:
      'Records counted per type. Both types are always present, at 0 when a ' +
      'type saw none, so a card never disappears mid-filter.',
  })
  byPaymentType: PaymentTypeBreakdownEntity;
}

export class PaymentKpiEntity extends ApiSuccessResponse {
  @ApiProperty({ type: PaymentKpiDataEntity })
  data: PaymentKpiDataEntity;
}
