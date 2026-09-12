import { ApiProperty } from '@nestjs/swagger';

/** The currency attached to an order in list responses. */
export class OrderCurrencyEntity {
  @ApiProperty({ example: '64b8c9f1e4b0a2d3c4f5g6h' })
  _id: string;

  @ApiProperty({ example: 'XAF' })
  isoCode: string;

  @ApiProperty({ example: 'Central African CFA Franc' })
  name: string;

  @ApiProperty({ example: 'FCFA' })
  symbol: string;

  @ApiProperty({ example: 950 })
  numericCode: number;

  @ApiProperty({ example: 0 })
  decimalPlaces: number;
}
