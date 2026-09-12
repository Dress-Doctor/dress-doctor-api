import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinDate,
} from 'class-validator';
import { PricingModelEnum } from 'src/schema/order/order.dto';

/**
 * Everything a DRAFT may still be changed to.
 *
 * A draft is the order before anyone is committed to it: no payment can be
 * recorded against it, no subscription quota or promo code has been spent, and
 * nothing has gone to the customer. So the whole of it is editable here —
 * including who it is for and where it is filed — and the same rules creation
 * applies (office posting, one draft per customer, weight for per-kg) are
 * re-checked on the way through.
 */
export class UpdateOrderDraftDto {
  @ApiProperty({
    required: false,
    description:
      'Move the draft to another customer. Refused if that customer already ' +
      'has a draft of their own.',
  })
  @IsOptional()
  @IsMongoId({ message: 'Invalid customerId' })
  customerId?: string;

  @ApiProperty({
    required: false,
    description:
      'Office the order belongs to. Same rule as creation: only a global ' +
      'role may file it elsewhere, and office staff are held to the offices ' +
      'they are posted to.',
  })
  @IsOptional()
  @IsMongoId({ message: 'Invalid officeId' })
  officeId?: string;

  @ApiProperty({ required: false, description: 'Currency the order is in' })
  @IsOptional()
  @IsMongoId({ message: 'Invalid currencyId' })
  currencyId?: string;

  @ApiProperty({
    required: false,
    description: 'Staff member who collected the garments',
  })
  @IsOptional()
  @IsMongoId({ message: 'Invalid pickedUpBy' })
  pickedUpBy?: string;

  @ApiProperty({
    required: false,
    enum: PricingModelEnum,
    description:
      'How the order is priced. Switching to PER_KG needs a weight, and ' +
      'switching to PER_PIECE needs a price for every garment already on the ' +
      'order — the reprice refuses with PRICE_NOT_FOUND otherwise, and the ' +
      'edit rolls back with it.',
  })
  @IsOptional()
  @IsEnum(PricingModelEnum, { message: 'Invalid pricingModel' })
  pricingModel?: PricingModelEnum;

  @ApiProperty({
    required: false,
    example: 20.5,
    description: 'Total weight (kg)',
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
      'Subtotal override for this draft (see POST /orders). Send 0 to hand ' +
      'pricing back to the engine.',
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
      'Anything specific the customer told us about this order. Send an ' +
      'empty string to clear it.',
    example: 'No starch on the blue shirt; collar stain on the white one.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'note cannot exceed 1000 characters' })
  note?: string;

  @ApiProperty({
    required: false,
    description: 'Business date the laundry was received',
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
    required: false,
    description: 'Estimated delivery date',
    example: new Date().toISOString(),
  })
  @IsOptional()
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
  estimatedDeliveryDate?: Date;
}
