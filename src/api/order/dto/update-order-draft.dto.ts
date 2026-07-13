import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdateOrderDraftDto {
  @ApiProperty({ required: false, description: 'Total weight (kg)' })
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
}
