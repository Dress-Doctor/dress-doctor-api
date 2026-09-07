import { ApiProperty } from '@nestjs/swagger';
import { ApiSuccessResponse } from 'src/dto/swagger.dto';

/**
 * The shapes every catalogue collection shares.
 *
 * The six of them — items, services, service types, categories, sub
 * categories and currencies — split the same three ways and carry the same
 * audit trail, so these are declared once here rather than restated in six
 * files that would then have to be kept in step. Only what actually differs
 * per collection (its own columns, its own usage figure) lives beside it.
 */

export class CatalogueStatusCountEntity {
  @ApiProperty({ example: 12, description: 'Active plus inactive' })
  all: number;

  @ApiProperty({ example: 10, description: 'Rows with isActive true' })
  active: number;

  @ApiProperty({ example: 2, description: 'Rows with isActive false' })
  inactive: number;
}

export class CatalogueKpiDataEntity {
  @ApiProperty({
    example: 10,
    description:
      'Rows matching every filter, `isActive` included. Equal to ' +
      '`byStatus.all` when no status filter was given.',
  })
  total: number;

  @ApiProperty({ example: 10, description: 'Same figure as byStatus.active' })
  totalActive: number;

  @ApiProperty({ example: 2, description: 'Same figure as byStatus.inactive' })
  totalInactive: number;

  @ApiProperty({
    type: CatalogueStatusCountEntity,
    description:
      'Counts by `isActive` over the same filters MINUS `isActive`, so the ' +
      'status tab strip keeps every count whichever tab is selected.',
  })
  byStatus: CatalogueStatusCountEntity;
}

export class CatalogueKpiEntity extends ApiSuccessResponse {
  @ApiProperty({ type: CatalogueKpiDataEntity })
  data: CatalogueKpiDataEntity;
}

export class CatalogueHistoryChangeEntity {
  @ApiProperty({ example: 'priceHigh' })
  field: string;

  @ApiProperty({ example: 2000, description: 'Value before the change' })
  from: unknown;

  @ApiProperty({ example: 2500, description: 'Value after the change' })
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

export class CatalogueHistoryEntryEntity {
  @ApiProperty({ example: 'UPDATE' })
  action: string;

  @ApiProperty({ required: false, example: 'Corrected the price range' })
  reason?: string;

  @ApiProperty({ type: [CatalogueHistoryChangeEntity] })
  changes: CatalogueHistoryChangeEntity[];

  @ApiProperty({
    required: false,
    description: 'The staff member behind the change, safe fields only.',
  })
  changedByUser?: Record<string, unknown>;

  @ApiProperty({ example: '2026-08-21T12:00:00Z' })
  createdAt: string;
}
