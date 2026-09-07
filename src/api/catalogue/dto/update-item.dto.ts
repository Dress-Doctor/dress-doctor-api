import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
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
 * The body `PATCH /reference/items/:reference` accepts.
 *
 * `itemName` IS editable, unlike the reference collections: nothing in the
 * platform matches an item by its name, so a correction is a correction.
 *
 * The two link lists REPLACE what the item had, they do not add to it. An
 * absent list leaves the links alone; an empty list clears them. That is the
 * only reading a checkbox group in the browser can send honestly — "these are
 * the categories now" — and it keeps the audit trail truthful about what the
 * operator saw when they saved.
 *
 * `reference` is absent for the usual reason: minted once, never edited.
 */
export class UpdateItemDto {
  @ApiProperty({ required: false, example: 'Polo Shirt' })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @MinLength(2)
  @MaxLength(100)
  itemName?: string;

  @ApiProperty({ required: false, example: 'SV-A4F92C' })
  @IsOptional()
  @IsString()
  @Transform(asReference)
  @MaxLength(50)
  @Matches(/^[A-Z0-9-]+$/, { message: 'Invalid serviceReference' })
  serviceReference?: string;

  @ApiProperty({ required: false, example: 'ST-A4F92C' })
  @IsOptional()
  @IsString()
  @Transform(asReference)
  @MaxLength(50)
  @Matches(/^[A-Z0-9-]+$/, { message: 'Invalid serviceTypeReference' })
  serviceTypeReference?: string;

  @ApiProperty({ required: false, example: 'CY-A4F92C' })
  @IsOptional()
  @IsString()
  @Transform(asReference)
  @MaxLength(50)
  @Matches(/^[A-Z0-9-]+$/, { message: 'Invalid currencyReference' })
  currencyReference?: string;

  @ApiProperty({ required: false, example: 1000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceLow?: number;

  @ApiProperty({ required: false, example: 2500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceHigh?: number;

  @ApiProperty({
    required: false,
    type: [String],
    example: ['CT-A4F92C'],
    description: 'Replaces the item’s categories. An empty list clears them.',
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
    description:
      'Replaces the item’s sub categories. An empty list clears them.',
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

  @ApiProperty({
    required: false,
    description:
      'Deactivating hides the item from every picker. Orders already ' +
      'carrying it keep it — this is not a delete.',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
