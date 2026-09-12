import { ApiProperty } from '@nestjs/swagger';
import { ApiSuccessResponse } from 'src/dto/swagger.dto';

export class CustomerStatusBreakdownEntity {
  @ApiProperty({ example: 118, description: 'Live accounts' })
  active: number;

  @ApiProperty({ example: 10, description: 'Soft-deleted accounts' })
  inactive: number;
}

export class CustomerKpiWindowEntity {
  @ApiProperty({
    example: '2026-08-12T00:00:00.000Z',
    description: 'Start of the range behind newCustomers and activeCustomers',
  })
  start: Date;

  @ApiProperty({
    example: '2026-08-25T23:59:59.999Z',
    description: 'End of that range — also the reference date for at-risk',
  })
  end: Date;

  @ApiProperty({
    example: '2026-08-12T00:00:00.000Z',
    description:
      'Start of the 14 days ending on `end`, the window atRiskCustomers is ' +
      'measured against. Equal to `start` only when no explicit range was ' +
      'given, or when the caller asked for exactly those 14 days.',
  })
  atRiskStart: Date;
}

export class CustomerKpiDataEntity {
  @ApiProperty({
    example: 128,
    description:
      'Customers matching the filters. The date range does NOT narrow this ' +
      'figure — it dates the metrics below instead.',
  })
  totalCustomers: number;

  @ApiProperty({
    example: 9,
    description: 'Registered inside the selected range',
  })
  newCustomers: number;

  @ApiProperty({
    example: 23,
    description: 'Placed at least one order inside the selected range',
  })
  activeCustomers: number;

  @ApiProperty({
    example: 14,
    description:
      'Ordered before, but not in the 14 days ending on the range end date — ' +
      'the chase list. A customer who has never ordered is a lead, not a ' +
      'risk, and is excluded.',
  })
  atRiskCustomers: number;

  @ApiProperty({
    type: CustomerStatusBreakdownEntity,
    description:
      'Counts by account status over the same filters MINUS `isActive`, so a ' +
      'status tab strip keeps both counts whichever tab is selected.',
  })
  byStatus: CustomerStatusBreakdownEntity;

  @ApiProperty({
    type: CustomerKpiWindowEntity,
    description:
      'The dates actually applied, resolved from the query or defaulted — so ' +
      'a client can label the cards without recomputing the rules.',
  })
  window: CustomerKpiWindowEntity;
}

export class CustomerKpiEntity extends ApiSuccessResponse {
  @ApiProperty({ type: CustomerKpiDataEntity })
  data: CustomerKpiDataEntity;
}
