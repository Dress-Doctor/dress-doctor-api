import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PaginationDto } from 'src/dto/request-data.dto';
import { PaymentTypeEnum } from 'src/schema/payment/payment.dto';

export class FindPaymentDto extends PaginationDto {
  @ApiProperty({
    required: false,
    description: 'Filter by order code (order number)',
    example: 'OR-A4F92C',
  })
  @IsOptional()
  @IsString()
  orderCode?: string;

  // Free text, not an enum: payment methods are catalog rows that can be
  // added without a deploy, so pinning the filter to a fixed list would reject
  // a method the catalog already accepts. An unknown name matches nothing.
  @ApiProperty({
    required: false,
    description: 'Filter by payment method name',
    example: 'Cash',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'Invalid paymentMethod' })
  paymentMethod?: string;

  @ApiProperty({
    required: false,
    enum: PaymentTypeEnum,
    description: 'Filter by payment type name',
    example: PaymentTypeEnum.PAYMENT,
  })
  @IsOptional()
  @IsEnum(PaymentTypeEnum, { message: 'Invalid paymentType' })
  paymentType?: PaymentTypeEnum;

  @ApiProperty({
    required: false,
    example: 'OF-DLA1',
    description:
      'Filter by office code. Office-scoped staff can only narrow within ' +
      'their own office — a code outside it returns nothing.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20, { message: 'Invalid officeCode' })
  officeCode?: string;

  @ApiProperty({
    required: false,
    description:
      'Start of the paidAt range (ISO). Defaults to 30 days ago, so the list ' +
      'never does an unbounded scan.',
    example: '2026-07-01',
  })
  @IsOptional()
  @IsDateString({}, { message: 'startDate must be an ISO date' })
  startDate?: string;

  @ApiProperty({
    required: false,
    description: 'End of the paidAt range (ISO). Defaults to now.',
    example: '2026-08-05',
  })
  @IsOptional()
  @IsDateString({}, { message: 'endDate must be an ISO date' })
  endDate?: string;

  @ApiProperty({
    required: false,
    example: 'Alice',
    description:
      'Free-text search across the payment reference and the customer first ' +
      'name, last name, email and phone',
  })
  @IsOptional()
  @IsString()
  q?: string;
}
