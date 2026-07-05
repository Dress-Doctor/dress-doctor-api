import { ApiProperty } from '@nestjs/swagger';
import { ApiSuccessResponse } from 'src/dto/swagger.dto';
import { ServiceTypeEntity } from './service-type.entity';
import { ServiceEntity } from './service.entity';
import { CategoryEntity } from './category.entity';
import { SubCategoryEntity } from './sub-category.entity';

class CurrencyEntity {
  @ApiProperty({ example: '507f1f77bcf86cd799439013' })
  _id: string;

  @ApiProperty({ example: 'XAF' })
  isoCode: string; // XAF, USD, EUR

  @ApiProperty({ example: 'Central African Republic' })
  countryName: string;

  @ApiProperty({ example: 'Central African CFA Franc' })
  name: string; // Central African CFA Franc

  @ApiProperty({ example: 'FCFA' })
  symbol: string; // FCFA

  @ApiProperty({ example: 950 })
  numericCode: number; // 950 for XAF (ISO 4217)

  @ApiProperty({ example: 2 })
  decimalPlaces: number; // 2 for most currencies

  @ApiProperty({ default: true, example: true })
  isActive: boolean;

  @ApiProperty({ example: '2023-07-21T12:00:00Z' })
  createdAt: string;

  @ApiProperty({ example: '2023-07-21T12:00:00Z' })
  updatedAt: string;
}

export class ItemEntity {
  @ApiProperty({ example: '64b8c9f1e4b0a2d3c4f5g6h' })
  _id: string;

  @ApiProperty({ example: 'T-Shirt' })
  itemName: string;

  @ApiProperty({ type: ServiceEntity })
  serviceId: ServiceEntity;

  @ApiProperty({ type: ServiceTypeEntity })
  serviceTypeId: ServiceTypeEntity;

  @ApiProperty({ type: CurrencyEntity })
  currencyId: CurrencyEntity;

  @ApiProperty({ type: [CategoryEntity] })
  categories: CategoryEntity[];

  @ApiProperty({ type: [SubCategoryEntity] })
  subCategories: SubCategoryEntity[];

  @ApiProperty({ example: 500 })
  priceLow: number;

  @ApiProperty({ example: 1000 })
  priceHigh: number;

  @ApiProperty({ default: true, example: true })
  isActive: boolean;

  @ApiProperty({ example: '2023-07-21T12:00:00Z' })
  createdAt: string;

  @ApiProperty({ example: '2023-07-21T12:00:00Z' })
  updatedAt: string;
}

export class FindAllItemEntity extends ApiSuccessResponse {
  @ApiProperty({ type: [ItemEntity] })
  data: ItemEntity[];
}
