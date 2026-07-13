import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDefined,
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  Min,
} from 'class-validator';
import { DebtTypeEnum } from 'src/schema/payment/payment.dto';

export class CreatePaymentDto {
  @ApiProperty({
    required: false,
    enum: DebtTypeEnum,
    description: 'Whether this settles the current order or clears old debt',
  })
  @IsOptional()
  @IsEnum(DebtTypeEnum, { message: 'Invalid debtType' })
  debtType?: DebtTypeEnum;

  @ApiProperty({ required: true, description: 'Payment method id' })
  @IsDefined({ message: 'PaymentMethodId is required' })
  @IsMongoId({ message: 'Invalid paymentMethodId' })
  paymentMethodId: string;

  @ApiProperty({ required: true, description: 'Amount paid', example: 0 })
  @IsDefined({ message: 'Amount is required' })
  @Transform(({ value }) => Number(value))
  @IsNumber({}, { message: 'Amount must be a number' })
  @Min(100, { message: 'Min amount is 100' })
  amount: number;

  @ApiProperty({ required: false, description: 'Transaction reference' })
  @IsOptional()
  transactionRef?: string;

  @ApiProperty({ required: false, description: 'Payment note' })
  @IsOptional()
  note?: string;

  @ApiProperty({
    required: true,
    description: 'Payment type',
    example: '64b8c9f1e4b0a2d3c4f5g6h',
  })
  @IsDefined({ message: 'Payment type id is required' })
  @IsMongoId({ message: 'Invalid paymentTypeId' })
  paymentTypeId: string;
}
