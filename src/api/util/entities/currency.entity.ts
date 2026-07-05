import { ApiProperty } from '@nestjs/swagger';

export class FindAllCurrencyEntity {
  @ApiProperty({ description: 'Currency id' })
  _id: string;

  @ApiProperty({ description: 'Currency name' })
  name: string;

  @ApiProperty({ description: 'Currency code' })
  code: string;

  @ApiProperty({ description: 'Currency symbol', required: false })
  symbol?: string;

  @ApiProperty({ description: 'Is currency active' })
  isActive: boolean;
}
