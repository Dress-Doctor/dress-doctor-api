import { ApiProperty } from '@nestjs/swagger';
import { ApiSuccessResponse } from 'src/dto/swagger.dto';

export class UserStatusCountEntity {
  @ApiProperty({ example: 24, description: 'Active plus inactive' })
  all: number;

  @ApiProperty({ example: 22, description: 'Staff with isActive true' })
  active: number;

  @ApiProperty({ example: 2, description: 'Staff with isActive false' })
  inactive: number;
}

export class UserKpiDataEntity {
  @ApiProperty({
    example: 24,
    description:
      'Staff matching every filter — the date window and `isActive` ' +
      'included. The same figure the list endpoint reports as its total.',
  })
  totalStaff: number;

  @ApiProperty({
    example: 22,
    description: 'Active staff, counted without the date window.',
  })
  totalActive: number;

  @ApiProperty({
    example: 2,
    description: 'Inactive staff, counted without the date window.',
  })
  totalInactive: number;

  @ApiProperty({
    example: 3,
    description:
      'Staff accounts created inside the selected period. With no window ' +
      'given this is every staff account matching the other filters.',
  })
  totalNew: number;

  @ApiProperty({
    type: UserStatusCountEntity,
    description:
      'Counts by `isActive` over the same filters MINUS `isActive`, the ' +
      'date window included — so a status tab strip keeps every count ' +
      'whichever tab is selected and still agrees with the table.',
  })
  byStatusCount: UserStatusCountEntity;
}

export class UserKpiEntity extends ApiSuccessResponse {
  @ApiProperty({ type: UserKpiDataEntity })
  data: UserKpiDataEntity;
}
