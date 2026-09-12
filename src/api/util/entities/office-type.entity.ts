import { ApiProperty } from '@nestjs/swagger';
import {
  ApiSuccessResponse,
  ApiSuccessResponseWithPagination,
} from 'src/dto/swagger.dto';

export class OfficeTypeEntity {
  @ApiProperty({ example: '64b8c9f1e4b0a2d3c4f5g6h' })
  _id: string;

  @ApiProperty({
    example: 'OT-A4F92C',
    description:
      'Human-readable identifier. Every read and write of a single office ' +
      'type is addressed by this, never by the mongo id.',
  })
  reference: string;

  @ApiProperty({ example: 'FACTORY' })
  officeTypeName: string;

  @ApiProperty({ example: 'Where the washing is done', required: false })
  description?: string;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty({ example: '2023-07-21T12:00:00Z' })
  createdAt: string;

  @ApiProperty({ example: '2023-07-21T12:00:00Z' })
  updatedAt: string;
}

export class FindAllOfficeTypeEntity extends ApiSuccessResponseWithPagination {
  @ApiProperty({ type: [OfficeTypeEntity] })
  data: OfficeTypeEntity[];
}

export class OfficeTypeStatusCountEntity {
  @ApiProperty({ example: 2, description: 'Active plus inactive' })
  all: number;

  @ApiProperty({ example: 2, description: 'Types with isActive true' })
  active: number;

  @ApiProperty({ example: 0, description: 'Types with isActive false' })
  inactive: number;
}

export class OfficeTypeKpiDataEntity {
  @ApiProperty({
    example: 2,
    description:
      'Office types matching every filter, `isActive` included. Equal to ' +
      '`byStatus.all` when no status filter was given.',
  })
  total: number;

  @ApiProperty({ example: 2, description: 'Same figure as byStatus.active' })
  totalActive: number;

  @ApiProperty({ example: 0, description: 'Same figure as byStatus.inactive' })
  totalInactive: number;

  @ApiProperty({
    type: OfficeTypeStatusCountEntity,
    description:
      'Counts by `isActive` over the same filters MINUS `isActive`, so the ' +
      'status tab strip keeps every count whichever tab is selected.',
  })
  byStatus: OfficeTypeStatusCountEntity;
}

export class OfficeTypeKpiEntity extends ApiSuccessResponse {
  @ApiProperty({ type: OfficeTypeKpiDataEntity })
  data: OfficeTypeKpiDataEntity;
}

export class OfficeTypeDetailDataEntity extends OfficeTypeEntity {
  @ApiProperty({
    example: 4,
    description: 'How many offices are currently of this type.',
  })
  officeCount: number;

  @ApiProperty({
    description:
      'Audit trail, newest first. Same shape as the other reference trails. ' +
      'The stored snapshot is never returned.',
  })
  history: Record<string, unknown>[];
}

export class OfficeTypeDetailEntity extends ApiSuccessResponse {
  @ApiProperty({ type: OfficeTypeDetailDataEntity })
  data: OfficeTypeDetailDataEntity;
}
