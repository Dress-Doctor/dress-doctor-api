import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * `userTypeName` is deliberately absent, and this is the one field a caller
 * most expects to find here.
 *
 * The name is what the rest of the platform matches on: `auth.service` puts it
 * into the JWT as the `userType` claim and compares it against
 * `UserTypeEum.CUSTOMER`, `user.service` branches on CUSTOMER and ADMIN when
 * creating a user, and `pickup.service` and `customer.service` look the seeded
 * rows up by it. A rename would leave every one of those finding nothing, and
 * the failure would surface as a signed-in user losing their permissions,
 * nowhere near this screen. Renaming is possible, but only once those services
 * address a type by its id or reference instead.
 *
 * `reference` is absent for the usual reason: minted once, never edited.
 */
export class UpdateUserTypeDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @ApiProperty({
    required: false,
    description:
      'Deactivating hides the type from every picker. Existing users keep ' +
      'it — this is not a delete.',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
