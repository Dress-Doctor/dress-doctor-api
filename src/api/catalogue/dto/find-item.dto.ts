import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { PaginationDto } from 'src/dto/request-data.dto';

/**
 * The filters behind `GET /reference/items`, its KPIs and its tab strip. One
 * DTO for all three, so the three can never disagree about what they are
 * looking at.
 *
 * The two picker filters take a reference, never an id: an item's service and
 * service type are how the catalogue is read ("everything we wash and fold"),
 * and a filter that needed a 24-character mongo id could not be put in a link.
 */
export class FindItemDto extends PaginationDto {
  @ApiProperty({
    required: false,
    example: 'Polo Shirt',
    description:
      'Free-text search across reference, itemName and displayName — so a ' +
      'category name finds the items filed under it.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiProperty({
    required: false,
    example: 'SV-A4F92C',
    description: 'Narrows to the items of one service, by its reference.',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @MaxLength(50)
  @Matches(/^[A-Z0-9-]+$/, { message: 'Invalid serviceReference' })
  serviceReference?: string;

  @ApiProperty({
    required: false,
    example: 'ST-A4F92C',
    description: 'Narrows to the items of one service type, by its reference.',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @MaxLength(50)
  @Matches(/^[A-Z0-9-]+$/, { message: 'Invalid serviceTypeReference' })
  serviceTypeReference?: string;

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
