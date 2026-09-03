import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * `orderStatusName` is deliberately absent, and this is the one field a caller
 * most expects to find here.
 *
 * `order.service` runs the order state machine off that exact string against
 * `OrderStatusEnum` — which transitions are allowed, which are terminal — and
 * `payment.service`, `office.service`, `pickup.service` and `reward.service`
 * look rows up by it as well. A rename would leave every one of those lookups
 * finding nothing, and the failure would surface as "cannot move this order",
 * nowhere near this screen. Renaming is possible, but only once those services
 * address a status by its id or reference instead.
 *
 * `reference` is absent for the usual reason: minted once, never edited.
 */
export class UpdateOrderStatusDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @ApiProperty({
    required: false,
    description:
      'Deactivating hides the status from every picker. The services still ' +
      'move orders into it by name, so this is a display change, not a ' +
      'workflow one.',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
