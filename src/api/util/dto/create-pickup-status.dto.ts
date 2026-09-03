import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDefined,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreatePickupStatusDto {
  @ApiProperty({
    required: true,
    example: 'RESCHEDULED',
    description:
      'Stored upper-case, and matched as a literal by the services — see ' +
      'the schema. Letters, digits and underscores only, the way the seeded ' +
      'names are spelled (PICKED_UP).',
  })
  @IsDefined({ message: 'pickupStatusName is required' })
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @MinLength(2)
  @MaxLength(100)
  @Matches(/^[A-Z0-9_]+$/, {
    message: 'pickupStatusName must be capitals, digits or underscores',
  })
  pickupStatusName: string;

  @ApiProperty({
    required: false,
    example: 'Customer asked for the collection to be moved.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}
