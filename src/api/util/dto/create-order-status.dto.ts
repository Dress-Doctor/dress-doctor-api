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

export class CreateOrderStatusDto {
  @ApiProperty({
    required: true,
    example: 'ON_HOLD',
    description:
      'Stored upper-case, and matched as a literal by the services — see ' +
      'the schema. Letters, digits and underscores only, the way the seeded ' +
      'names are spelled (ON_HOLD).',
  })
  @IsDefined({ message: 'orderStatusName is required' })
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @MinLength(2)
  @MaxLength(100)
  @Matches(/^[A-Z0-9_]+$/, {
    message: 'orderStatusName must be capitals, digits or underscores',
  })
  orderStatusName: string;

  @ApiProperty({
    required: false,
    example: 'Order is paused while the customer confirms a repair.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}
