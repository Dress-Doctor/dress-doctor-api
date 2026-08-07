import { ApiProperty } from '@nestjs/swagger';
import { ApiSuccessResponse } from 'src/dto/swagger.dto';

export class OrderStatusBreakdownEntity {
  @ApiProperty({ example: 42, description: 'Total across all statuses' })
  all: number;

  @ApiProperty({ example: 3 })
  draft: number;

  @ApiProperty({ example: 5 })
  confirmed: number;

  @ApiProperty({ example: 4 })
  received: number;

  @ApiProperty({ example: 6 })
  washing: number;

  @ApiProperty({ example: 8 })
  ready: number;

  @ApiProperty({ example: 14 })
  delivered: number;

  @ApiProperty({ example: 2 })
  cancelled: number;
}

export class OrderKpiDataEntity {
  @ApiProperty({
    example: 128,
    description: 'Orders matching the filters, across every status',
  })
  totalOrders: number;

  @ApiProperty({
    example: 34,
    description:
      'On the floor right now: confirmed + received + washing. Excludes ' +
      'drafts, which have not been taken in yet.',
  })
  inProgress: number;

  @ApiProperty({
    example: 12,
    description: 'Ready and waiting on the customer — the chase list',
  })
  readyForCollection: number;

  @ApiProperty({ example: 74, description: 'Orders handed over' })
  delivered: number;

  @ApiProperty({ example: 6, description: 'Orders called off' })
  cancelled: number;

  @ApiProperty({
    example: 122,
    description:
      'Orders that could have completed (total − cancelled) — the divisor ' +
      'behind completionRate, so a client can render "74 of 122".',
  })
  completionBase: number;

  @ApiProperty({
    example: 60.7,
    description:
      'delivered / (total − cancelled), as a percentage to one decimal. ' +
      '0 when nothing could have completed.',
  })
  completionRate: number;

  @ApiProperty({
    type: OrderStatusBreakdownEntity,
    description:
      'Counts across every status over the applied filters MINUS ' +
      '`orderStatus` — always present, and the only figure here that does ' +
      'not narrow when a status filter is set. Feed a status tab strip from ' +
      'this; the fields above follow the current filter instead.',
  })
  byOrderStatus: OrderStatusBreakdownEntity;
}

export class OrderKpiEntity extends ApiSuccessResponse {
  @ApiProperty({ type: OrderKpiDataEntity })
  data: OrderKpiDataEntity;
}
