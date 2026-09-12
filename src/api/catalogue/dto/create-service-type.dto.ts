import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDefined,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateServiceTypeDto {
  @ApiProperty({ required: true, example: 'Premium' })
  @IsDefined({ message: 'serviceTypeName is required' })
  @IsString()
  // Trimmed, but the operator's own capitalisation is kept: unlike a user
  // type, a service type name is a label people read, not a token the platform
  // matches on.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @MinLength(2)
  @MaxLength(100)
  serviceTypeName: string;

  @ApiProperty({
    required: false,
    example: 'Hand finished, 48-hour turnaround.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}
