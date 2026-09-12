import { ApiProperty } from '@nestjs/swagger';
import {
  ApiSuccessResponse,
  ApiSuccessResponseWithPagination,
} from 'src/dto/swagger.dto';
import { CatalogueHistoryEntryEntity } from './catalogue.entity';

export class CurrencyEntity {
  @ApiProperty({ example: '507f1f77bcf86cd799439013' })
  _id: string;

  @ApiProperty({
    example: 'CY-A4F92C',
    description:
      'Human-readable identifier. Every read and write of a single currency ' +
      'is addressed by this, never by the mongo id.',
  })
  reference: string;

  @ApiProperty({
    example: 'XAF',
    description:
      'ISO 4217 alphabetic code. Not editable: `payment.service` looks the ' +
      'house currency up by this exact string.',
  })
  isoCode: string;

  @ApiProperty({ example: 'Central African Republic' })
  countryName: string;

  @ApiProperty({ example: 'Central African CFA Franc' })
  name: string;

  @ApiProperty({ example: 'FCFA' })
  symbol: string;

  @ApiProperty({ example: 950, description: 'ISO 4217 numeric code' })
  numericCode: number;

  @ApiProperty({ example: 2, description: 'Places in the minor unit' })
  decimalPlaces: number;

  @ApiProperty({ default: true, example: true })
  isActive: boolean;

  @ApiProperty({ example: '2023-07-21T12:00:00Z' })
  createdAt: string;

  @ApiProperty({ example: '2023-07-21T12:00:00Z' })
  updatedAt: string;
}

export class FindAllCurrencyEntity extends ApiSuccessResponseWithPagination {
  @ApiProperty({ type: [CurrencyEntity] })
  data: CurrencyEntity[];
}

export class CurrencyDetailDataEntity extends CurrencyEntity {
  @ApiProperty({
    example: 8,
    description: 'How many items are priced in this currency.',
  })
  itemCount: number;

  @ApiProperty({
    example: 412,
    description: 'How many payments have been taken in this currency.',
  })
  paymentCount: number;

  @ApiProperty({
    type: [CatalogueHistoryEntryEntity],
    description:
      'Audit trail, newest first. The stored snapshot is never returned.',
  })
  history: CatalogueHistoryEntryEntity[];
}

export class CurrencyDetailEntity extends ApiSuccessResponse {
  @ApiProperty({ type: CurrencyDetailDataEntity })
  data: CurrencyDetailDataEntity;
}
