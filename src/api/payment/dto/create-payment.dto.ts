import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDefined,
  IsMongoId,
  IsNumber,
  IsOptional,
  Min,
} from 'class-validator';
import { PaymentTypeEnum } from 'src/schema/payment/payment.dto';

export class CreatePaymentDto {
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
    example: PaymentTypeEnum.REFUND,
  })
  @IsDefined({ message: 'Payment type is required' })
  @IsMongoId({ message: 'Invalid paymentTypeId' })
  paymentTypeId: string;
}
