import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * `paymentMethodName` is deliberately absent, and this is the one field a
 * caller most expects to find here.
 *
 * `payment.service` resolves the payment list's `paymentMethod` filter with an
 * exact `findOne` on this string — no case-folding — against the values in
 * `PaymentMethodEnum` (`Cash`, `MTN Momo`, `Orange Money`). A rename would
 * leave that filter matching nothing, and the failure would surface as "the
 * payments page shows none of my MoMo takings", nowhere near this screen.
 * Renaming is possible, but only once that filter resolves a method by its id
 * or reference instead.
 *
 * `reference` is absent for the usual reason: minted once, never edited.
 */
export class UpdatePaymentMethodDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @ApiProperty({
    required: false,
    description:
      'Deactivating hides the method from every picker. Payments already ' +
      'taken by it keep it — this is not a delete.',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
