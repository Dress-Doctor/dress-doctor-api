import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDefined,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateCategoryDto {
  @ApiProperty({ required: true, example: 'Women' })
  @IsDefined({ message: 'categoryName is required' })
  @IsString()
  // Trimmed, but the operator's own capitalisation is kept: unlike a user
  // type, a category name is a label people read, not a token the platform
  // matches on.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @MinLength(2)
  @MaxLength(100)
  categoryName: string;

  @ApiProperty({ required: false, example: 'Womenswear.' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}
