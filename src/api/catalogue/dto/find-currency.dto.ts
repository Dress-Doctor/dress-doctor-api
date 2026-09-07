import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationDto } from 'src/dto/request-data.dto';

/**
 * The filters behind `GET /reference/currencies`, its KPIs and its tab strip.
 * One DTO for all three, so the three can never disagree about what they are
 * looking at.
 */
export class FindCurrencyDto extends PaginationDto {
  @ApiProperty({
    required: false,
    example: 'XAF',
    description:
      'Free-text search across reference, isoCode, name, countryName and ' +
      'symbol. A currency is looked for by its code as often as by its name, ' +
      'so both are searched.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiProperty({
    required: false,
    description: 'Narrows to active or inactive rows. Omit for both.',
  })
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined ? undefined : value === 'true' || value === true,
  )
  @IsBoolean()
  isActive?: boolean;
}
