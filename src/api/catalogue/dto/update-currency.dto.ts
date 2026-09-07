import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * `isoCode` is deliberately absent, and it is the one field a caller most
 * expects to find here.
 *
 * The code is what the platform matches on: `payment.service` reads the house
 * currency with `findOne({ isoCode: 'XAF' })`, and every money figure the
 * panel shows is joined on it. A rename would leave that lookup finding
 * nothing, and the failure would surface as a payment with no currency,
 * nowhere near this screen. The display name and the symbol are editable
 * instead, which is what a correction usually means.
 *
 * `reference` is absent for the usual reason: minted once, never edited.
 */
export class UpdateCurrencyDto {
  @ApiProperty({ required: false, example: 'United States Dollar' })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @MaxLength(100)
  name?: string;

  @ApiProperty({ required: false, example: 'United States' })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @MaxLength(100)
  countryName?: string;

  @ApiProperty({ required: false, example: '$' })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @MaxLength(10)
  symbol?: string;

  @ApiProperty({ required: false, example: 2 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(0)
  @Max(6)
  decimalPlaces?: number;

  @ApiProperty({
    required: false,
    description:
      'Deactivating hides the currency from every picker. Payments and ' +
      'items already in it keep it — this is not a delete.',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
