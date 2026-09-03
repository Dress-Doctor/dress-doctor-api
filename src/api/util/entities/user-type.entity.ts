import { ApiProperty } from '@nestjs/swagger';
import { ApiSuccessResponse } from 'src/dto/swagger.dto';

export class UserTypeEntity {
  @ApiProperty({ example: '64b8c9f1e4b0a2d3c4f5g6h' })
  _id: string;

  @ApiProperty({
    example: 'UT-A4F92C',
    description:
      'Human-readable identifier. Every read and write of a single user ' +
      'type is addressed by this, never by the mongo id.',
  })
  reference: string;

  @ApiProperty({ example: 'CUSTOMER' })
  userTypeName: string;

  @ApiProperty({
    example: 'End user who places laundry pickup and delivery orders.',
  })
  description: string;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty({ example: '2023-07-21T12:00:00Z' })
  createdAt: string;

  @ApiProperty({ example: '2023-07-21T12:00:00Z' })
  updatedAt: string;
}

export class FindAllUserTypeEntity extends ApiSuccessResponse {
  @ApiProperty({ type: [UserTypeEntity] })
  data: UserTypeEntity[];
}

export class UserTypeStatusCountEntity {
  @ApiProperty({ example: 6, description: 'Active plus inactive' })
  all: number;

  @ApiProperty({ example: 5, description: 'User types with isActive true' })
  active: number;

  @ApiProperty({ example: 1, description: 'User types with isActive false' })
  inactive: number;
}

export class UserTypeKpiDataEntity {
  @ApiProperty({
    example: 5,
    description:
      'User types matching every filter, `isActive` included. Equal to ' +
      '`byStatus.all` when no status filter was given.',
  })
  total: number;

  @ApiProperty({ example: 5, description: 'Same figure as byStatus.active' })
  totalActive: number;

  @ApiProperty({ example: 1, description: 'Same figure as byStatus.inactive' })
  totalInactive: number;

  @ApiProperty({
    type: UserTypeStatusCountEntity,
    description:
      'Counts by `isActive` over the same filters MINUS `isActive`, so the ' +
      'status tab strip keeps every count whichever tab is selected.',
  })
  byStatus: UserTypeStatusCountEntity;
}

export class UserTypeKpiEntity extends ApiSuccessResponse {
  @ApiProperty({ type: UserTypeKpiDataEntity })
  data: UserTypeKpiDataEntity;
}

export class UserTypeHistoryChangeEntity {
  @ApiProperty({ example: 'isActive' })
  field: string;

  @ApiProperty({ example: true, description: 'Value before the change' })
  from: unknown;

  @ApiProperty({ example: false, description: 'Value after the change' })
  to: unknown;

  @ApiProperty({
    required: false,
    description:
      'Readable stand-in for `from` when the field is a foreign key.',
  })
  fromLabel?: string;

  @ApiProperty({
    required: false,
    description: 'Readable stand-in for `to` when the field is a foreign key.',
  })
  toLabel?: string;
}

export class UserTypeHistoryEntryEntity {
  @ApiProperty({ example: 'UPDATE' })
  action: string;

  @ApiProperty({ required: false, example: 'Renamed after the role rework' })
  reason?: string;

  @ApiProperty({ type: [UserTypeHistoryChangeEntity] })
  changes: UserTypeHistoryChangeEntity[];

  @ApiProperty({
    required: false,
    description: 'The staff member behind the change, safe fields only.',
  })
  changedByUser?: Record<string, unknown>;

  @ApiProperty({ example: '2026-08-21T12:00:00Z' })
  createdAt: string;
}

export class UserTypeDetailDataEntity extends UserTypeEntity {
  @ApiProperty({
    example: 12,
    description: 'How many users currently hold this type.',
  })
  userCount: number;

  @ApiProperty({
    type: [UserTypeHistoryEntryEntity],
    description:
      'Audit trail, newest first. The stored snapshot is never returned.',
  })
  history: UserTypeHistoryEntryEntity[];
}

export class UserTypeDetailEntity extends ApiSuccessResponse {
  @ApiProperty({ type: UserTypeDetailDataEntity })
  data: UserTypeDetailDataEntity;
}
