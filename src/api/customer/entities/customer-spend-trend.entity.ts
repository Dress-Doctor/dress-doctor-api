import { ApiProperty } from '@nestjs/swagger';
import { ApiSuccessResponse } from 'src/dto/swagger.dto';

export class SpendTrendMonthEntity {
  @ApiProperty({ example: '2026-08', description: 'Calendar month, UTC' })
  month: string;

  @ApiProperty({ example: 52000, description: 'Ordered that month, int XAF' })
  ordered: number;

  @ApiProperty({ example: 24000, description: 'Paid that month, int XAF' })
  paid: number;

  @ApiProperty({ example: 3, description: 'Orders raised that month' })
  orders: number;
}

export class SpendTrendDataEntity {
  @ApiProperty({
    type: [SpendTrendMonthEntity],
    description:
      'Oldest month first, with every month in the window present — a month ' +
      'with no orders reads as a zero, not as a gap in the chart.',
  })
  months: SpendTrendMonthEntity[];

  @ApiProperty({ example: 16041, description: 'Ordered ÷ orders, int XAF' })
  averageOrder: number;

  @ApiProperty({ example: 2, description: 'Orders per month over the window' })
  ordersPerMonth: number;

  @ApiProperty({
    required: false,
    example: 18,
    description:
      'Percent change of the last three months against the three before ' +
      'them. Null when the earlier window is empty — there is nothing to ' +
      'compare against, and calling that a rise of infinity would mislead.',
  })
  changePercent?: number;
}

export class SpendTrendResponseEntity extends ApiSuccessResponse {
  @ApiProperty({ type: SpendTrendDataEntity })
  data: SpendTrendDataEntity;
}
