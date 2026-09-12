import { ApiProperty } from '@nestjs/swagger';
import {
  IsDefined,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateRoleDto {
  @ApiProperty({
    required: true,
    example: 'Night Supervisor',
    description:
      'What the role is called. Letters, digits, spaces, & and - only: the ' +
      'name is read off a screen and quoted in conversation, not parsed.',
  })
  @IsDefined({ message: 'Role name is required' })
  @IsString()
  @MinLength(2, { message: 'Role name must be at least 2 characters long' })
  @MaxLength(50, { message: 'Role name must be less than 50 characters' })
  @Matches(/^[A-Za-z0-9&-]+( [A-Za-z0-9&-]+)*$/, {
    message:
      'Role name must be letters, digits, spaces, & or - with single spaces',
  })
  roleName: string;

  @ApiProperty({
    required: false,
    example: 'Runs the counter on the late shift.',
    description: 'What this role is for, in the operator’s own words.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Description must be less than 255 characters' })
  description?: string;
}
