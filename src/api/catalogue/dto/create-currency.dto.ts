import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDefined,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  MaxLength,
} from 'class-validator';

export class CreateCurrencyDto {
  @ApiProperty({
    required: true,
    example: 'USD',
    description:
      'ISO 4217 alphabetic code, three letters. Stored upper-case and never ' +
      'editable afterwards: `payment.service` looks the house currency up by ' +
      'this exact string.',
  })
  @IsDefined({ message: 'isoCode is required' })
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @Length(3, 3, { message: 'isoCode must be exactly 3 letters' })
  @Matches(/^[A-Z]{3}$/, { message: 'isoCode must be 3 letters' })
  isoCode: string;

  @ApiProperty({ required: true, example: 'United States' })
  @IsDefined({ message: 'countryName is required' })
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @MaxLength(100)
  countryName: string;

  @ApiProperty({ required: true, example: 'United States Dollar' })
  @IsDefined({ message: 'name is required' })
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @MaxLength(100)
  name: string;

  @ApiProperty({ required: true, example: '$' })
  @IsDefined({ message: 'symbol is required' })
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @MaxLength(10)
  symbol: string;

  @ApiProperty({
    required: true,
    example: 840,
    description: 'ISO 4217 numeric code — 950 for XAF, 840 for USD.',
  })
  @IsDefined({ message: 'numericCode is required' })
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(999)
  numericCode: number;

  @ApiProperty({
    required: false,
    example: 2,
    description:
      'How many places the minor unit has. Two for most currencies, zero ' +
      'for XAF. Defaults to 2 when omitted.',
  })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(0)
  @Max(6)
  decimalPlaces?: number;
}
