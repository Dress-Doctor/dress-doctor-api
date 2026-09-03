import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDefined,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateOfficeTypeDto {
  @ApiProperty({ required: true, example: 'DEPOT' })
  @IsDefined({ message: 'officeTypeName is required' })
  @IsString()
  // Stored upper-case, the way the seeded rows are, so DEPOT and Depot can
  // never end up as two different office types.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @MinLength(2)
  @MaxLength(100)
  officeTypeName: string;

  @ApiProperty({
    required: false,
    example: 'Holds garments between the factory and a branch.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}
