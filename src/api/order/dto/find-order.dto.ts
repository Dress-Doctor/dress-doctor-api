import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
} from 'class-validator';
import { PaginationDto } from 'src/dto/request-data.dto';
import {
  OrderPaymentStatusEnum,
  OrderStatusEnum,
  PricingModelEnum,
} from 'src/schema/order/order.dto';

export class FindOrderDto extends PaginationDto {
  @ApiProperty({
    required: false,
    description: 'Filter by order code (order number)',
    example: 'ORD-001',
  })
  @IsOptional()
  @IsString()
  orderCode?: string;

  @ApiProperty({
    required: false,
    description:
      'Free-text search across order code, customer phone and customer name',
    example: 'Alice',
  })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiProperty({
    required: false,
    description:
      'Start of the receivedAt range (ISO). Defaults to 30 days ago.',
    example: '2026-07-01',
  })
  @IsOptional()
  @IsDateString({}, { message: 'startDate must be an ISO date' })
  startDate?: string;

  @ApiProperty({
    required: false,
    description: 'End of the receivedAt range (ISO). Defaults to now.',
    example: '2026-08-05',
  })
  @IsOptional()
  @IsDateString({}, { message: 'endDate must be an ISO date' })
  endDate?: string;

  @ApiProperty({
    required: false,
    description: 'Filter by customer id',
    example: '64b8c9f1e4b0a2d3c4f5g6h',
  })
  @IsOptional()
  @IsMongoId({ message: 'Invalid customerId' })
  customerId?: string;

  @ApiProperty({
    required: false,
    description: 'Filter by pickup request id',
    example: '64b8c9f1e4b0a2d3c4f5g6h',
  })
  @IsOptional()
  @IsMongoId({ message: 'Invalid pickupRequestId' })
  pickupRequestId?: string;

  @ApiProperty({
    required: false,
    enum: OrderStatusEnum,
    description: 'Filter by order status name',
    example: OrderStatusEnum.READY,
  })
  @IsOptional()
  @IsEnum(OrderStatusEnum, { message: 'Invalid orderStatus' })
  orderStatus?: OrderStatusEnum;

  @ApiProperty({
    required: false,
    enum: OrderPaymentStatusEnum,
    description:
      'Filter by payment status. System-maintained from the payments on the ' +
      'order — never typed in.',
    example: OrderPaymentStatusEnum.UNPAID,
  })
  @IsOptional()
  @IsEnum(OrderPaymentStatusEnum, { message: 'Invalid paymentStatus' })
  paymentStatus?: OrderPaymentStatusEnum;

  @ApiProperty({
    required: false,
    enum: PricingModelEnum,
    description: 'Filter by how the order was priced',
    example: PricingModelEnum.PER_KG,
  })
  @IsOptional()
  @IsEnum(PricingModelEnum, { message: 'Invalid pricingModel' })
  pricingModel?: PricingModelEnum;

  @ApiProperty({
    required: false,
    example: 'OF-DLA-01',
    description:
      'Filter by office code. Office-scoped staff can only narrow within ' +
      'their own office — a code outside it returns nothing.',
  })
  @IsOptional()
  @IsString()
  officeCode?: string;

  @ApiProperty({
    required: false,
    description: 'Filter by the staff member who collected the garments',
    example: '64b8c9f1e4b0a2d3c4f5g6h',
  })
  @IsOptional()
  @IsMongoId({ message: 'Invalid pickedUpBy' })
  pickedUpBy?: string;

  @ApiProperty({
    required: false,
    example: 'US-8KQTMR',
    description:
      'Filter by the staff member who opened the order, addressed by user ' +
      'reference the way the rest of the platform addresses a user. An ' +
      'unknown reference returns nothing, never everything.',
  })
  @IsOptional()
  @IsString()
  createdByReference?: string;
}
