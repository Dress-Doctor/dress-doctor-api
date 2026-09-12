import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Correcting a payment that was recorded wrong. Every field is optional —
 * only what is sent is changed — but the endpoint refuses an empty body
 * rather than writing an audit entry that says nothing happened.
 *
 * Deliberately NOT editable:
 *  - `paymentTypeId`: flipping PAYMENT↔REFUND moves the order's balance by
 *    twice the amount and turns money in into money out. A mistyped payment
 *    is reversed with a refund, not rewritten into one.
 *  - `paymentPeriod`: derived from `paidAt` against the order's month, so it
 *    follows a date change on its own and can never be asserted.
 *  - `orderId` / `customerId` / `officeId` / `currencyId`: a payment against
 *    the wrong order is not an edit, it is two corrections on two orders.
 */
export class UpdatePaymentDto {
  @ApiProperty({
    required: false,
    example: 1500,
    description:
      'Corrected amount. Recomputes the order’s paid total, balance, ' +
      'payment status and flag.',
  })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber({}, { message: 'Amount must be a number' })
  @Min(100, { message: 'Min amount is 100' })
  amount?: number;

  @ApiProperty({
    required: false,
    description:
      'Corrected payment method id. The method is a catalog row, so it is ' +
      'given by id here — unlike the list filter, which matches by name.',
  })
  @IsOptional()
  @IsMongoId({ message: 'Invalid paymentMethodId' })
  paymentMethodId?: string;

  @ApiProperty({
    required: false,
    example: '2026-08-08T15:04:00.000Z',
    description:
      'When the money actually changed hands. Moving it across a month ' +
      'boundary re-derives `paymentPeriod`.',
  })
  @IsOptional()
  @IsDateString({}, { message: 'paidAt must be an ISO date' })
  paidAt?: string;

  @ApiProperty({ required: false, description: 'Transaction reference' })
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Invalid transactionRef' })
  transactionRef?: string;

  @ApiProperty({ required: false, description: 'Payment note' })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Invalid note' })
  note?: string;
}
