import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDefined,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateServiceDto {
  @ApiProperty({ required: true, example: 'Wash and Iron' })
  @IsDefined({ message: 'serviceName is required' })
  @IsString()
  // Trimmed, but the operator's own capitalisation is kept: unlike a user
  // type, a service name is a label people read, not a token the platform
  // matches on.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @MinLength(2)
  @MaxLength(100)
  serviceName: string;

  @ApiProperty({ required: false, example: 'Washed, dried and pressed.' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}
