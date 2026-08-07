import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateOrderDraftDto {
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
}
