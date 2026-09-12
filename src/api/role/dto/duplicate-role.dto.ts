import { ApiProperty } from '@nestjs/swagger';
import {
  IsDefined,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * What `POST /v1/roles/:reference/duplicate` takes.
 *
 * Only the new name, and optionally new wording. What the copy grants is not
 * sent: it is whatever the role being copied grants right now, read here
 * rather than posted back, so a stale screen cannot widen the copy.
 */
export class DuplicateRoleDto {
  @ApiProperty({
    required: true,
    example: 'Office Manager copy',
    description: 'What the new role is called. Must not clash with a role.',
  })
  @IsDefined({ message: 'Role name is required' })
  @IsString()
  @MinLength(2, { message: 'Role name must be at least 2 characters long' })
  @MaxLength(50, { message: 'Role name must be less than 50 characters' })
  // The same rule as CreateRoleDto, deliberately: a copy is an ordinary role
  // from the moment it exists, and one it could not later be renamed to would
  // be a trap.
  @Matches(/^[A-Za-z0-9&-]+( [A-Za-z0-9&-]+)*$/, {
    message:
      'Role name must be letters, digits, spaces, & or - with single spaces',
  })
  roleName: string;

  @ApiProperty({ required: false, example: 'Copied from Office Manager.' })
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Description must be less than 255 characters' })
  description?: string;
}
