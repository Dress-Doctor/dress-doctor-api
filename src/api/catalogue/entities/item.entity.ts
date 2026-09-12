import { ApiProperty } from '@nestjs/swagger';
import {
  ApiSuccessResponse,
  ApiSuccessResponseWithPagination,
} from 'src/dto/swagger.dto';
import { CatalogueHistoryEntryEntity } from './catalogue.entity';
import { CategoryEntity } from './category.entity';
import { CurrencyEntity } from './currency.entity';
import { ServiceTypeEntity } from './service-type.entity';
import { ServiceEntity } from './service.entity';
import { SubCategoryEntity } from './sub-category.entity';

export class ItemEntity {
  @ApiProperty({ example: '64b8c9f1e4b0a2d3c4f5g6h' })
  _id: string;

  @ApiProperty({
    example: 'IT-A4F92C',
    description:
      'Human-readable identifier. Every read and write of a single item is ' +
      'addressed by this, never by the mongo id.',
  })
  reference: string;

  @ApiProperty({ example: 'T-Shirt' })
  itemName: string;

  @ApiProperty({
    example: 'Jeans (Men - Bottoms)',
    description:
      'The item qualified by what it is filed under, built by the API and ' +
      'never accepted on a write. Several categories join with a comma, and ' +
      'the bracket is dropped when the item is filed under nothing.',
  })
  displayName: string;

  @ApiProperty({
    type: ServiceEntity,
    description: 'The service itself, resolved. `serviceId` carries the id.',
  })
  service: ServiceEntity;

  @ApiProperty({ type: ServiceTypeEntity })
  serviceType: ServiceTypeEntity;

  @ApiProperty({ type: CurrencyEntity })
  currency: CurrencyEntity;

  @ApiProperty({ type: [CategoryEntity] })
  categories: CategoryEntity[];

  @ApiProperty({ type: [SubCategoryEntity] })
  subCategories: SubCategoryEntity[];

  @ApiProperty({ example: 500 })
  priceLow: number;

  @ApiProperty({ example: 1000 })
  priceHigh: number;

  @ApiProperty({
    example: 750,
    description:
      'Midpoint of the range above, rounded to a whole unit. Built by the ' +
      'API and never accepted on a write. Not `OrderItem.unitPrice`, which ' +
      'records what a line was actually charged.',
  })
  unitPrice: number;

  @ApiProperty({ default: true, example: true })
  isActive: boolean;

  @ApiProperty({ example: '2023-07-21T12:00:00Z' })
  createdAt: string;

  @ApiProperty({ example: '2023-07-21T12:00:00Z' })
  updatedAt: string;
}

export class FindAllItemEntity extends ApiSuccessResponseWithPagination {
  @ApiProperty({ type: [ItemEntity] })
  data: ItemEntity[];
}

export class ItemDetailDataEntity extends ItemEntity {
  @ApiProperty({
    example: 43,
    description: 'How many order lines have been filed against this item.',
  })
  orderItemCount: number;

  @ApiProperty({
    type: [CatalogueHistoryEntryEntity],
    description:
      'Audit trail, newest first. The stored snapshot is never returned.',
  })
  history: CatalogueHistoryEntryEntity[];
}

export class ItemDetailEntity extends ApiSuccessResponse {
  @ApiProperty({ type: ItemDetailDataEntity })
  data: ItemDetailDataEntity;
}
