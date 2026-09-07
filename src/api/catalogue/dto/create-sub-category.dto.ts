import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDefined,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateSubCategoryDto {
  @ApiProperty({ required: true, example: 'Dresses' })
  @IsDefined({ message: 'subCategoryName is required' })
  @IsString()
  // Trimmed, but the operator's own capitalisation is kept: unlike a user
  // type, a sub category name is a label people read, not a token the platform
  // matches on.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @MinLength(2)
  @MaxLength(100)
  subCategoryName: string;

  @ApiProperty({ required: false, example: 'Dresses and gowns.' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}
