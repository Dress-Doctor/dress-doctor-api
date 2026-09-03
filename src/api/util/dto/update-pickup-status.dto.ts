import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * `pickupStatusName` is deliberately absent, and this is the one field a
 * caller most expects to find here.
 *
 * `pickup.service` and `order.service` match the seeded rows by that exact
 * string against `PickupStatusEnum` — creating a pickup looks up `PENDING` by
 * name, and the order flow compares against `ASSIGNED`, `PICKED_UP` and
 * `CANCELLED`. A rename would leave those lookups finding nothing, and the
 * failure would surface as "cannot create a pickup", nowhere near this screen.
 * Renaming is possible, but only once those services address a status by its
 * id or reference instead.
 *
 * `reference` is absent for the usual reason: minted once, never edited.
 */
export class UpdatePickupStatusDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @ApiProperty({
    required: false,
    description:
      'Deactivating hides the status from every picker. The services still ' +
      'assign it by name, so this is a display change, not a workflow one.',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
