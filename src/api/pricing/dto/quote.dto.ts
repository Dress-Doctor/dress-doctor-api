import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDefined,
  IsEnum,
  IsInt,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { PricingModelEnum } from 'src/schema/order/order.dto';

export class QuoteLineDto {
  @ApiProperty({ required: true, description: 'Catalog item id' })
  @IsDefined({ message: 'itemId is required' })
  @IsMongoId({ message: 'Invalid itemId' })
  itemId: string;

  @ApiProperty({ required: true, description: 'Service type id for this line' })
  @IsDefined({ message: 'serviceTypeId is required' })
  @IsMongoId({ message: 'Invalid serviceTypeId' })
  serviceTypeId: string;

  @ApiProperty({ required: true, example: 2 })
  @IsDefined({ message: 'quantity is required' })
  @IsInt({ message: 'quantity must be an integer' })
  @Min(1, { message: 'quantity must be at least 1' })
  quantity: number;

  @ApiProperty({
    required: false,
    example: 750.5,
    description:
      'Agreed price for one garment on this line. Supplied, it replaces the ' +
      'price list for this line and no PRICE_NOT_FOUND can arise from it.',
  })
  @IsOptional()
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'unitPrice must be a number with at most 2 decimals' },
  )
  @Min(0, { message: 'unitPrice cannot be negative' })
  unitPrice?: number;
}

export class QuoteDto {
  @ApiProperty({ required: true, enum: PricingModelEnum })
  @IsDefined({ message: 'pricingModel is required' })
  @IsEnum(PricingModelEnum, { message: 'Invalid pricingModel' })
  pricingModel: PricingModelEnum;

  @ApiProperty({
    required: false,
    description: 'Office id — omit for company-wide pricing',
  })
  @IsOptional()
  @IsMongoId({ message: 'Invalid officeId' })
  officeId?: string;

  @ApiProperty({
    required: false,
    description: 'Customer id — enables per-customer promo limits',
  })
  @IsOptional()
  @IsMongoId({ message: 'Invalid customerId' })
  customerId?: string;

  @ApiProperty({
    required: false,
    example: 20.5,
    description: 'Total weight (kg) — required for PER_KG and SUBSCRIPTION',
  })
  @IsOptional()
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'totalWeightKg must be a number with at most 2 decimals' },
  )
  @Min(0)
  totalWeightKg?: number;

  @ApiProperty({ required: false, description: 'Promo code to apply' })
  @IsOptional()
  @IsString()
  promoCode?: string;

  @ApiProperty({
    required: false,
    example: 500.5,
    description:
      'Agreed subtotal. Supplied, it replaces the subtotal this engine would ' +
      'have computed; discounts and the total are still derived from it.',
  })
  @IsOptional()
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'orderAmount must be a number with at most 2 decimals' },
  )
  @Min(0, { message: 'orderAmount cannot be negative' })
  orderAmount?: number;

  @ApiProperty({
    required: false,
    example: 250.5,
    description: 'Staff ad-hoc discount (XAF) — permissioned, not a promo',
  })
  @IsOptional()
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'manualDiscount must be a number with at most 2 decimals' },
  )
  @Min(0)
  manualDiscount?: number;

  @ApiProperty({
    required: false,
    type: [QuoteLineDto],
    description: 'Garment lines (priced for PER_PIECE; QC-only otherwise)',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuoteLineDto)
  items?: QuoteLineDto[];
}
