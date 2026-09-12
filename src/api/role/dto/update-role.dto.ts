import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * What `PATCH /v1/roles/:reference` accepts.
 *
 * Every field is optional — the panel sends only what changed. There is no
 * delete: a role people still hold is switched off, never removed, or the
 * postings pointing at it would name nothing.
 */
export class UpdateRoleDto {
  @ApiProperty({ required: false, example: 'Night Supervisor' })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Role name must be at least 2 characters long' })
  @MaxLength(50, { message: 'Role name must be less than 50 characters' })
  @Matches(/^[A-Za-z0-9&-]+( [A-Za-z0-9&-]+)*$/, {
    message:
      'Role name must be letters, digits, spaces, & or - with single spaces',
  })
  roleName?: string;

  @ApiProperty({
    required: false,
    example: 'Runs the counter on the late shift.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Description must be less than 255 characters' })
  description?: string;

  @ApiProperty({
    required: false,
    description:
      'Switching a role off stops it being offered when somebody is given a ' +
      'role. Anybody already holding it keeps it — and keeps what it grants.',
  })
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined ? undefined : value === 'true' || value === true,
  )
  @IsBoolean()
  isActive?: boolean;
}
