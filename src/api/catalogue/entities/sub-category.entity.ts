import { ApiProperty } from '@nestjs/swagger';
import {
  ApiSuccessResponse,
  ApiSuccessResponseWithPagination,
} from 'src/dto/swagger.dto';
import { CatalogueHistoryEntryEntity } from './catalogue.entity';

export class SubCategoryEntity {
  @ApiProperty({ example: '64b8c9f1e4b0a2d3c4f5g6h' })
  _id: string;

  @ApiProperty({
    example: 'SC-A4F92C',
    description:
      'Human-readable identifier. Every read and write of a single sub category ' +
      'is addressed by this, never by the mongo id.',
  })
  reference: string;

  @ApiProperty({ example: 'Top' })
  subCategoryName: string;

  @ApiProperty({
    required: false,
    example: 'Clothing items worn on the upper body.',
  })
  description?: string;

  @ApiProperty({ default: true, example: true })
  isActive: boolean;

  @ApiProperty({ example: '2023-07-21T12:00:00Z' })
  createdAt: string;

  @ApiProperty({ example: '2023-07-21T12:00:00Z' })
  updatedAt: string;
}

export class FindAllSubCategoryEntity extends ApiSuccessResponseWithPagination {
  @ApiProperty({ type: [SubCategoryEntity] })
  data: SubCategoryEntity[];
}

export class SubCategoryDetailDataEntity extends SubCategoryEntity {
  @ApiProperty({
    example: 8,
    description: 'How many items sit in this sub category.',
  })
  itemCount: number;

  @ApiProperty({
    type: [CatalogueHistoryEntryEntity],
    description:
      'Audit trail, newest first. The stored snapshot is never returned.',
  })
  history: CatalogueHistoryEntryEntity[];
}

export class SubCategoryDetailEntity extends ApiSuccessResponse {
  @ApiProperty({ type: SubCategoryDetailDataEntity })
  data: SubCategoryDetailDataEntity;
}
