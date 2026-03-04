import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDefined,
  IsMongoId,
  // IsNumber,
  // IsOptional,
  // Min,
  MinDate,
} from 'class-validator';

export class CreateOrderDto {
  @ApiProperty({ required: true, description: 'Customer id' })
  @IsDefined({ message: 'CustomerId is required' })
  @IsMongoId({ message: 'Invalid customerId' })
  customerId: string;

  @ApiProperty({ required: true, description: 'Currency id' })
  @IsDefined({ message: 'CurrencyId is required' })
  @IsMongoId({ message: 'Invalid currencyId' })
  currencyId: string;

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
