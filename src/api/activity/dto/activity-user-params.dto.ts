import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDefined, IsString, Matches, MaxLength } from 'class-validator';

/**
 * The user whose trail is being read, addressed by reference (`US-8KQTMR`)
 * the way the rest of the platform addresses a user.
 *
 * Declared here rather than borrowed from the user module: the trail is read
 * by roles that have no business importing the user feature's DTOs, and a
 * params class this small is cheaper duplicated than coupled.
 */
export class ActivityUserParamsDto {
  @ApiProperty({
    required: true,
    example: 'US-8KQTMR',
    description: 'Human-readable user reference',
  })
  @IsDefined({ message: 'reference is required' })
  @IsString({ message: 'Invalid reference' })
  // References are generated upper-case; accepting a lower-case one typed by
  // hand costs nothing and saves a spurious 404.
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @MaxLength(32, { message: 'Invalid reference' })
  @Matches(/^[A-Z]{2}-[A-Z0-9]+$/, { message: 'Invalid reference' })
  reference: string;
}
