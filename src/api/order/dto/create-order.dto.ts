import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDate,
  IsDefined,
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinDate,
  ValidateNested,
} from 'class-validator';
import { PricingModelEnum } from 'src/schema/order/order.dto';
import { CreateOrderItemDto } from './create-order-item.dto';

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
    example: 20.5,
    description:
      'Total weight (kg) — required for PER_KG. Decimal: scales read 20.5, ' +
      'not 20.',
  })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'totalWeightKg must be a number with at most 2 decimals' },
  )
  @Min(0)
  totalWeightKg?: number;

  @ApiProperty({
    required: false,
    example: 500.5,
    description:
      'Subtotal for this order, before discounts. Overrides what the pricing ' +
      'engine would have computed and survives later reprices — send it only ' +
      'when the counter agreed a price. Omit and the engine prices the order ' +
      '(PER_KG: weight × the configured per-kg rate).',
  })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'orderAmount must be a number with at most 2 decimals' },
  )
  @Min(0, { message: 'orderAmount cannot be negative' })
  orderAmount?: number;

  @ApiProperty({
    required: false,
    example: 250.5,
    description: 'Staff ad-hoc discount (XAF), permissioned',
  })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'manualDiscount must be a number with at most 2 decimals' },
  )
  @Min(0)
  manualDiscount?: number;

  @ApiProperty({ required: false, description: 'Promo code to apply' })
  @IsOptional()
  @IsString()
  promoCode?: string;

  @ApiProperty({
    required: false,
    description:
      'Anything specific the customer told us about this order — a stain, a ' +
      'fabric warning, a delivery instruction.',
    example: 'No starch on the blue shirt; collar stain on the white one.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'note cannot exceed 1000 characters' })
  note?: string;

  @ApiProperty({
    required: false,
    description:
      'Office the order belongs to. Only global roles may set it; office ' +
      'staff always book into their own office and a different id is ' +
      'rejected. Defaults to the caller’s office.',
  })
  @IsOptional()
  @IsMongoId({ message: 'Invalid officeId' })
  officeId?: string;

  // discountAmount/totalAmount/balanceDue stay computed (§2.3): they fall out
  // of orderAmount minus the discounts, so accepting them would let a client
  // state a total its own numbers contradict.

  @ApiProperty({
    required: false,
    isArray: true,
    type: CreateOrderItemDto,
    description:
      'Garments booked with the order, so a counter can take the whole ' +
      'intake in one request. Item ids are checked up front, and the order, ' +
      'its lines and the price snapshot are committed in one transaction — a ' +
      'garment that cannot be priced books no order at all. Omit it and the ' +
      'order is created empty, exactly as before; lines can still be added ' +
      'afterwards through POST /orders/:orderId/items while it is in DRAFT.',
  })
  @IsOptional()
  @IsArray({ message: 'items must be an array' })
  @ArrayMaxSize(100, {
    message: 'An order cannot be created with over 100 items',
  })
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items?: CreateOrderItemDto[];

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
