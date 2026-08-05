import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDate,
  IsDefined,
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Min,
  MinDate,
} from 'class-validator';
import { PricingModelEnum } from 'src/schema/order/order.dto';

export class CreateOrderDto {
  @ApiProperty({ required: true, description: 'Customer id' })
  @IsDefined({ message: 'CustomerId is required' })
  @IsMongoId({ message: 'Invalid customerId' })
  customerId: string;

  @ApiProperty({ required: true, description: 'Currency id' })
  @IsDefined({ message: 'CurrencyId is required' })
  @IsMongoId({ message: 'Invalid currencyId' })
  currencyId: string;

  @ApiProperty({
    required: false,
    description:
      'User id of the agent who picked up the laundry (defaults to the creator)',
  })
  @IsOptional()
  @IsMongoId({ message: 'Invalid pickedUpBy' })
  pickedUpBy?: string;

  @ApiProperty({ required: true, enum: PricingModelEnum })
  @IsDefined({ message: 'pricingModel is required' })
  @IsEnum(PricingModelEnum, { message: 'Invalid pricingModel' })
  pricingModel: PricingModelEnum;

  @ApiProperty({
    required: false,
    description: 'Total weight (kg) — required for PER_KG',
  })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt({ message: 'totalWeightKg must be an integer' })
  @Min(0)
  totalWeightKg?: number;

  @ApiProperty({
    required: false,
    description: 'Staff ad-hoc discount (XAF), permissioned',
  })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt({ message: 'manualDiscount must be an integer (XAF)' })
  @Min(0)
  manualDiscount?: number;

  @ApiProperty({ required: false, description: 'Promo code to apply' })
  @IsOptional()
  @IsString()
  promoCode?: string;

  // @ApiProperty({ required: false, description: 'Fee amount', example: 0 })
  // @IsDefined({ message: 'fee is required' })
  // @Transform(({ value }) => Number(value))
  // @IsNumber({}, { message: 'Fee must be a number' })
  // @Min(0, { message: 'Fee cannot be negative' })
  // fee: number;

  // @ApiProperty({ required: false, description: 'Order amount', example: 0 })
  // @IsDefined({ message: 'orderAmount is required' })
  // @Transform(({ value }) => Number(value))
  // @IsNumber({}, { message: 'OrderAmount must be a number' })
  // @Min(0, { message: 'OrderAmount cannot be negative' })
  // orderAmount: number;

  // @ApiProperty({ required: false, description: 'Discount applied', example: 0 })
  // @IsOptional()
  // @Transform(({ value }) => Number(value))
  // @IsNumber({}, { message: 'DiscountAmount must be a number' })
  // @Min(0, { message: 'DiscountAmount cannot be negative' })
  // discountAmount?: number;

  // @ApiProperty({ required: false, description: 'Total amount', example: 0 })
  // @IsDefined({ message: 'totalAmount is required' })
  // @Transform(({ value }) => Number(value))
  // @IsNumber({}, { message: 'TotalAmount must be a number' })
  // @Min(0, { message: 'TotalAmount cannot be negative' })
  // totalAmount: number;

  @ApiProperty({
    required: false,
    description:
      'Business date the laundry was received (defaults to now if omitted)',
    example: new Date().toISOString(),
  })
  @IsOptional()
  @Transform(
    ({ value }): Date =>
      typeof value === 'string' ? new Date(value) : (value as Date),
  )
  @IsDate({ message: 'receivedAt must be a valid date' })
  receivedAt?: Date;

  @ApiProperty({
    required: true,
    description: 'Estimated delivery date',
    example: new Date().toISOString(),
  })
  @IsDefined({ message: 'EstimatedDeliveryDate is required' })
  @Transform(
    ({ value }): Date =>
      typeof value === 'string' ? new Date(value) : (value as Date),
  )
  @MinDate(
    () => {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      return date;
    },
    { message: 'Estimated delivery date must be today or later' },
  )
  estimatedDeliveryDate: Date;
}

export class CreateOrderWithPickupDto extends CreateOrderDto {
  @ApiProperty({ required: true, description: 'Pickup request id' })
  @IsDefined({ message: 'PickupRequestId is required' })
  @IsMongoId({ message: 'Invalid pickupRequestId' })
  pickupRequestId: string;
}
