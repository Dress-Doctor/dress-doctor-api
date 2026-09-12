import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsDefined,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** Upper-cases and trims one reference, or leaves a non-string alone. */
const asReference = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

/** The same, over a list. A body may send one reference or several. */
const asReferenceList = ({ value }: { value: unknown }) => {
  const list = Array.isArray(value) ? value : [value];
  return list
    .filter((entry) => typeof entry === 'string')
    .map((entry: string) => entry.trim().toUpperCase())
    .filter(Boolean);
};

/**
 * The body `POST /reference/items` accepts.
 *
 * Every link is named by the target's own reference, never by a mongo id: the
 * catalogue screen has references and nothing else, and a body that demanded
 * an id would push the 24-character value back out to the browser, which is
 * the whole thing the reference column exists to prevent. The API resolves
 * each one and refuses the request if any is unknown.
 */
export class CreateItemDto {
  @ApiProperty({ required: true, example: 'Polo Shirt' })
  @IsDefined({ message: 'itemName is required' })
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @MinLength(2)
  @MaxLength(100)
  itemName: string;

  @ApiProperty({ required: true, example: 'SV-A4F92C' })
  @IsDefined({ message: 'serviceReference is required' })
  @IsString()
  @Transform(asReference)
  @MaxLength(50)
  @Matches(/^[A-Z0-9-]+$/, { message: 'Invalid serviceReference' })
  serviceReference: string;

  @ApiProperty({ required: true, example: 'ST-A4F92C' })
  @IsDefined({ message: 'serviceTypeReference is required' })
  @IsString()
  @Transform(asReference)
  @MaxLength(50)
  @Matches(/^[A-Z0-9-]+$/, { message: 'Invalid serviceTypeReference' })
  serviceTypeReference: string;

  @ApiProperty({ required: true, example: 'CY-A4F92C' })
  @IsDefined({ message: 'currencyReference is required' })
  @IsString()
  @Transform(asReference)
  @MaxLength(50)
  @Matches(/^[A-Z0-9-]+$/, { message: 'Invalid currencyReference' })
  currencyReference: string;

  @ApiProperty({
    required: true,
    example: 1000,
    description: 'Lower end of the price range, in the currency named above.',
  })
  @IsDefined({ message: 'priceLow is required' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceLow: number;

  @ApiProperty({
    required: true,
    example: 2500,
    description:
      'Upper end of the price range. Must not be below `priceLow` — the ' +
      'service checks the pair, which no per-field rule can.',
  })
  @IsDefined({ message: 'priceHigh is required' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceHigh: number;

  @ApiProperty({
    required: false,
    type: [String],
    example: ['CT-A4F92C'],
    description: 'The categories this item belongs to, by reference.',
  })
  @IsOptional()
  @Transform(asReferenceList)
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @Matches(/^[A-Z0-9-]+$/, { each: true, message: 'Invalid categoryReference' })
  categoryReferences?: string[];

  @ApiProperty({
    required: false,
    type: [String],
    example: ['SC-A4F92C'],
    description: 'The sub categories this item belongs to, by reference.',
  })
  @IsOptional()
  @Transform(asReferenceList)
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @Matches(/^[A-Z0-9-]+$/, {
    each: true,
    message: 'Invalid subCategoryReference',
  })
  subCategoryReferences?: string[];
}
