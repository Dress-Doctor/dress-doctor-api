import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDefined,
  IsMongoId,
  IsNumber,
  IsOptional,
  Min,
} from 'class-validator';

export class CreatePaymentDto {
  @ApiProperty({ required: true, description: 'Payment method id' })
  @IsDefined({ message: 'PaymentMethodId is required' })
  @IsMongoId({ message: 'Invalid paymentMethodId' })
  paymentMethodId: string;

  @ApiProperty({ required: true, description: 'Amount paid', example: 0 })
  @IsDefined({ message: 'Amount is required' })
  @Transform(({ value }) => Number(value))
  @IsNumber({}, { message: 'Amount must be a number' })
  @Min(0, { message: 'Amount cannot be negative' })
  amount: number;

  @ApiProperty({ required: false, description: 'Transaction reference' })
  @IsOptional()
  transactionRef?: string;

  @ApiProperty({ required: false, description: 'Payment note' })
  @IsOptional()
  note?: string;

  @ApiProperty({ required: true, description: 'Currency id' })
  @IsDefined({ message: 'CurrencyId is required' })
  @IsMongoId({ message: 'Invalid currencyId' })
  currencyId: string;

  @ApiProperty({ required: true, description: 'Payment status id' })
  @IsDefined({ message: 'PaymentStatusId is required' })
  @IsMongoId({ message: 'Invalid paymentStatusId' })
  paymentStatusId: string;
}
