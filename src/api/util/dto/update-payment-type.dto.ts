import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * `paymentTypeName` is deliberately absent, and this is the one field a caller
 * most expects to find here.
 *
 * `payment.service` decides whether a payment is a refund by comparing this
 * string against `PaymentTypeEnum.REFUND` inside an aggregation, and both it
 * and `office.service` group their takings by it. A rename would stop refunds
 * being counted as refunds — the money would simply be reported wrong, with
 * nothing to say why. Renaming is possible, but only once those aggregations
 * address a type by its id or reference instead.
 *
 * `reference` is absent for the usual reason: minted once, never edited.
 */
export class UpdatePaymentTypeDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @ApiProperty({
    required: false,
    description:
      'Deactivating hides the type from every picker. Payments already filed ' +
      'under it keep it — this is not a delete.',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
