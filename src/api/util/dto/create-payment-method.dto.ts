import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDefined,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreatePaymentMethodDto {
  @ApiProperty({
    required: true,
    example: 'Bank Transfer',
    description:
      'Trimmed but NOT upper-cased, unlike the status collections: the seeded ' +
      'methods are spelled `Cash`, `MTN Momo` and `Orange Money`, and ' +
      '`payment.service` matches this string exactly. Capitalising a new one ' +
      'would leave the list reading two different ways.',
  })
  @IsDefined({ message: 'paymentMethodName is required' })
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @MinLength(2)
  @MaxLength(100)
  paymentMethodName: string;

  @ApiProperty({
    required: false,
    example: 'Paid straight into the company bank account.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}
