import { ApiProperty } from '@nestjs/swagger';
import {
  ApiSuccessResponse,
  ApiSuccessResponseWithPagination,
} from 'src/dto/swagger.dto';
import { CatalogueHistoryEntryEntity } from './catalogue.entity';

export class CategoryEntity {
  @ApiProperty({ example: '64b8c9f1e4b0a2d3c4f5g6h' })
  _id: string;

  @ApiProperty({
    example: 'CT-A4F92C',
    description:
      'Human-readable identifier. Every read and write of a single category ' +
      'is addressed by this, never by the mongo id.',
  })
  reference: string;

  @ApiProperty({ example: 'Men' })
  categoryName: string;

  @ApiProperty({
    required: false,
    example: 'Clothing and accessories for men.',
  })
  description?: string;

  @ApiProperty({ default: true, example: true })
  isActive: boolean;

  @ApiProperty({ example: '2023-07-21T12:00:00Z' })
  createdAt: string;

  @ApiProperty({ example: '2023-07-21T12:00:00Z' })
  updatedAt: string;
}

export class FindAllCategoryEntity extends ApiSuccessResponseWithPagination {
  @ApiProperty({ type: [CategoryEntity] })
  data: CategoryEntity[];
}

export class CategoryDetailDataEntity extends CategoryEntity {
  @ApiProperty({
    example: 8,
    description: 'How many items sit in this category.',
  })
  itemCount: number;

  @ApiProperty({
    type: [CatalogueHistoryEntryEntity],
    description:
      'Audit trail, newest first. The stored snapshot is never returned.',
  })
  history: CatalogueHistoryEntryEntity[];
}

export class CategoryDetailEntity extends ApiSuccessResponse {
  @ApiProperty({ type: CategoryDetailDataEntity })
  data: CategoryDetailDataEntity;
}
