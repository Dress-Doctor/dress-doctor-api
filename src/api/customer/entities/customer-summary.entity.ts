import { ApiProperty } from '@nestjs/swagger';
import { ApiSuccessResponse } from 'src/dto/swagger.dto';

export class CustomerOrderTotalsEntity {
  @ApiProperty({
    example: 24,
    description: 'Every order ever created for them, cancellations included',
  })
  total: number;

  @ApiProperty({
    example: 1,
    description:
      'Of those, the ones called off. Cancelled work never sold anything and ' +
      'owes nothing, so every money figure below leaves it out.',
  })
  cancelled: number;

  @ApiProperty({
    example: 6,
    description:
      'Orders raised at the counter rather than off a pickup. An order can ' +
      'exist without a pickup, and a pickup can carry several orders, so the ' +
      'two counts never have to agree.',
  })
  withoutPickup: number;

  @ApiProperty({
    example: 22,
    description:
      'Orders the payment engine marks PAID or OVERPAID. Read off the ' +
      'computed `paymentStatus`, never re-derived from the balance.',
  })
  paidInFull: number;
}

export class CustomerSpendTotalsEntity {
  @ApiProperty({ example: 385000, description: 'Σ order totals, integer XAF' })
  ordered: number;

  @ApiProperty({
    example: 350000,
    description: 'Σ payments taken, integer XAF',
  })
  paid: number;

  @ApiProperty({ example: 35000, description: 'Σ balance due, integer XAF' })
  outstanding: number;

  @ApiProperty({
    example: 2,
    description: 'How many orders carry that balance',
  })
  outstandingOrders: number;
}

export class CustomerPaymentTotalsEntity {
  @ApiProperty({
    example: 31,
    description:
      'Receipts recorded, refunds included \u2014 a refund is a payment row ' +
      'like any other, which is how the payments ledger counts them too.',
  })
  count: number;

  @ApiProperty({
    example: 350000,
    description: 'The same net figure as `spend.paid`, integer XAF',
  })
  total: number;

  @ApiProperty({ example: 11290, description: 'Integer XAF, rounded' })
  average: number;
}

export class CustomerPaymentMethodEntity {
  @ApiProperty({ example: 'MOMO' })
  method: string;

  @ApiProperty({
    example: 168000,
    description: 'Net of refunds taken back on this method, integer XAF',
  })
  amount: number;

  @ApiProperty({ example: 14 })
  count: number;

  @ApiProperty({
    example: 48,
    description: 'Percent of the amount paid, 0–100',
  })
  share: number;

  @ApiProperty({ example: '2026-08-21T10:42:00.000Z' })
  lastUsedAt: Date;
}

export class CustomerActivityEntity {
  @ApiProperty({ required: false })
  lastOrderAt?: Date;

  @ApiProperty({ required: false })
  lastPickupAt?: Date;

  @ApiProperty({ required: false })
  lastPaymentAt?: Date;

  @ApiProperty({
    required: false,
    description: 'The most recent of the three — what "gone quiet" measures',
  })
  lastActivityAt?: Date;

  @ApiProperty({
    required: false,
    example: 4,
    description: 'Whole days since the last order. Null if they never ordered.',
  })
  daysSinceLastOrder?: number;

  @ApiProperty({
    example: false,
    description:
      'The customers overview\u2019s own rule: they ordered before, and ' +
      'nothing in the 14 days ending today. A customer who has never ordered ' +
      'is a lead, not a risk, so this is false for them.',
  })
  atRisk: boolean;
}

export class CustomerSummaryDataEntity {
  @ApiProperty({ type: CustomerOrderTotalsEntity })
  orders: CustomerOrderTotalsEntity;

  @ApiProperty({ example: 18, description: 'Pickup requests ever raised' })
  totalPickups: number;

  @ApiProperty({ type: CustomerSpendTotalsEntity })
  spend: CustomerSpendTotalsEntity;

  @ApiProperty({ type: CustomerPaymentTotalsEntity })
  payments: CustomerPaymentTotalsEntity;

  @ApiProperty({
    type: [CustomerPaymentMethodEntity],
    description: 'How they pay, biggest share first',
  })
  methods: CustomerPaymentMethodEntity[];

  @ApiProperty({ type: CustomerActivityEntity })
  activity: CustomerActivityEntity;
}

export class CustomerSummaryResponseEntity extends ApiSuccessResponse {
  @ApiProperty({ type: CustomerSummaryDataEntity })
  data: CustomerSummaryDataEntity;
}
