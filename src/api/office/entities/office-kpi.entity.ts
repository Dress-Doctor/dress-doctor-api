import { ApiProperty } from '@nestjs/swagger';
import { ApiSuccessResponse } from 'src/dto/swagger.dto';

export class OfficeStatusCountEntity {
  @ApiProperty({ example: 14, description: 'Active plus inactive' })
  all: number;

  @ApiProperty({ example: 12, description: 'Offices with isActive true' })
  active: number;

  @ApiProperty({ example: 2, description: 'Offices with isActive false' })
  inactive: number;
}

export class OfficeKpiDataEntity {
  @ApiProperty({
    example: 12,
    description:
      'Offices matching every filter, `isActive` included. Equal to ' +
      '`byStatusCount.all` when no status filter was given.',
  })
  totalOffices: number;

  @ApiProperty({
    example: 12,
    description: 'Same figure as byStatusCount.active',
  })
  totalActive: number;

  @ApiProperty({
    example: 2,
    description: 'Same figure as byStatusCount.inactive',
  })
  totalInactive: number;

  @ApiProperty({
    type: OfficeStatusCountEntity,
    description:
      'Counts by `isActive` over the same filters MINUS `isActive`, so a ' +
      'status tab strip keeps every count whichever tab is selected.',
  })
  byStatusCount: OfficeStatusCountEntity;
}

export class OfficeKpiEntity extends ApiSuccessResponse {
  @ApiProperty({ type: OfficeKpiDataEntity })
  data: OfficeKpiDataEntity;
}
