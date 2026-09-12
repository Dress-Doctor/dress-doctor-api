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

export class CreatePaymentTypeDto {
  @ApiProperty({
    required: true,
    example: 'CHARGEBACK',
    description:
      'Stored upper-case, the way the seeded `PAYMENT` and `REFUND` are, and ' +
      'matched as a literal by the services. Letters, digits and underscores ' +
      'only.',
  })
  @IsDefined({ message: 'paymentTypeName is required' })
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @MinLength(2)
  @MaxLength(100)
  @Matches(/^[A-Z0-9_]+$/, {
    message: 'paymentTypeName must be capitals, digits or underscores',
  })
  paymentTypeName: string;

  @ApiProperty({
    required: false,
    example: 'Money taken back from the company by the card issuer.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}
