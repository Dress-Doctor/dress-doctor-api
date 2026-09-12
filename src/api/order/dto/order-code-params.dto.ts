import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDefined, IsString, Matches, MaxLength } from 'class-validator';

export class OrderCodeParamsDto {
  @ApiProperty({
    required: true,
    example: 'OR-000123',
    description: 'Human-readable order reference (order code)',
  })
  @IsDefined({ message: 'orderCode is required' })
  @IsString({ message: 'Invalid orderCode' })
  // Codes are generated upper-case; accepting a lower-case one typed off a
  // receipt costs nothing and saves a spurious 404.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @MaxLength(50, { message: 'Invalid orderCode' })
  @Matches(/^[A-Z0-9-]+$/, { message: 'Invalid orderCode' })
  orderCode: string;
}
