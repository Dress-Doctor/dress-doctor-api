import { ApiProperty } from '@nestjs/swagger';
import { ApiSuccessResponse } from 'src/dto/swagger.dto';

export class PickupStatusBreakdownEntity {
  @ApiProperty({ example: 42, description: 'Total across all statuses' })
  all: number;

  @ApiProperty({ example: 9 })
  pending: number;

  @ApiProperty({ example: 7 })
  confirmed: number;

  @ApiProperty({ example: 5 })
  assigned: number;

  @ApiProperty({ example: 19, description: 'PICKED_UP' })
  pickedUp: number;

  @ApiProperty({ example: 2 })
  cancelled: number;
}

export class PickupKpiDataEntity {
  @ApiProperty({
    example: 128,
    description: 'Pickup requests matching the filters, across every status',
  })
  totalPickups: number;

  @ApiProperty({
    example: 21,
    description: 'Requested and awaiting confirmation — the call-back list',
  })
  pending: number;

  @ApiProperty({
    example: 74,
    description: 'Garments collected from the customer (PICKED_UP)',
  })
  completed: number;

  @ApiProperty({
    example: 122,
    description:
      'Pickups that could have completed (total − cancelled) — the divisor ' +
      'behind completionRate, so a client can render "74 of 122".',
  })
  completionBase: number;

  @ApiProperty({
    example: 60.7,
    description:
      'completed / (total − cancelled), as a percentage to one decimal. ' +
      '0 when nothing could have completed.',
  })
  completionRate: number;

  @ApiProperty({
    type: PickupStatusBreakdownEntity,
    description:
      'Counts across every status over the applied filters MINUS ' +
      '`pickupStatusName` — always present, and the only figure here that ' +
      'does not narrow when a status filter is set. Feed a status tab strip ' +
      'from this; the fields above follow the current filter instead.',
  })
  byPickupStatus: PickupStatusBreakdownEntity;
}

export class PickupKpiEntity extends ApiSuccessResponse {
  @ApiProperty({ type: PickupKpiDataEntity })
  data: PickupKpiDataEntity;
}
