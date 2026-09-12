import { ApiProperty } from '@nestjs/swagger';
import { ApiSuccessResponse } from 'src/dto/swagger.dto';

export class PickupStatusEntity {
  @ApiProperty({ example: '64b8c9f1e4b0a2d3c4f5g6h' })
  _id: string;

  @ApiProperty({
    example: 'PS-A4F92C',
    description:
      'Human-readable identifier. Every read and write of a single pickup ' +
      'status is addressed by this, never by the mongo id.',
  })
  reference: string;

  @ApiProperty({ example: 'PENDING' })
  pickupStatusName: string;

  @ApiProperty({
    example: 'Pickup request has been submitted and is awaiting confirmation.',
  })
  description: string;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty({ example: '2023-07-21T12:00:00Z' })
  createdAt: string;

  @ApiProperty({ example: '2023-07-21T12:00:00Z' })
  updatedAt: string;
}

export class FindAllPickupStatusEntity extends ApiSuccessResponse {
  @ApiProperty({ type: [PickupStatusEntity] })
  data: PickupStatusEntity[];
}

export class PickupStatusStatusCountEntity {
  @ApiProperty({ example: 5, description: 'Active plus inactive' })
  all: number;

  @ApiProperty({ example: 5, description: 'Statuses with isActive true' })
  active: number;

  @ApiProperty({ example: 0, description: 'Statuses with isActive false' })
  inactive: number;
}

export class PickupStatusKpiDataEntity {
  @ApiProperty({
    example: 5,
    description:
      'Pickup statuses matching every filter, `isActive` included. Equal to ' +
      '`byStatus.all` when no status filter was given.',
  })
  total: number;

  @ApiProperty({ example: 5, description: 'Same figure as byStatus.active' })
  totalActive: number;

  @ApiProperty({ example: 0, description: 'Same figure as byStatus.inactive' })
  totalInactive: number;

  @ApiProperty({
    type: PickupStatusStatusCountEntity,
    description:
      'Counts by `isActive` over the same filters MINUS `isActive`, so the ' +
      'status tab strip keeps every count whichever tab is selected.',
  })
  byStatus: PickupStatusStatusCountEntity;
}

export class PickupStatusKpiEntity extends ApiSuccessResponse {
  @ApiProperty({ type: PickupStatusKpiDataEntity })
  data: PickupStatusKpiDataEntity;
}

export class PickupStatusDetailDataEntity extends PickupStatusEntity {
  @ApiProperty({
    example: 42,
    description: 'How many pickup requests currently sit at this status.',
  })
  pickupCount: number;

  @ApiProperty({
    description:
      'Audit trail, newest first. Same shape as the user-type trail. The ' +
      'stored snapshot is never returned.',
  })
  history: Record<string, unknown>[];
}

export class PickupStatusDetailEntity extends ApiSuccessResponse {
  @ApiProperty({ type: PickupStatusDetailDataEntity })
  data: PickupStatusDetailDataEntity;
}
