import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDefined,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateUserTypeDto {
  @ApiProperty({ required: true, example: 'OFFICE MANAGER' })
  @IsDefined({ message: 'userTypeName is required' })
  @IsString()
  // Stored upper-case, the way the seeded rows are, so ADMIN and Admin can
  // never end up as two different user types.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @MinLength(2)
  @MaxLength(100)
  userTypeName: string;

  @ApiProperty({
    required: false,
    example: 'Runs the day-to-day of one office.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}
