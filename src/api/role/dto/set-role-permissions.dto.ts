import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDefined,
  IsEnum,
  IsMongoId,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { ScopeEnum } from 'src/schema/admin/admin.dto';

/** One permission a role is to hold, and how widely. */
export class RolePermissionEntryDto {
  @ApiProperty({
    required: true,
    description: 'Id of the permission row — an action on a subject.',
  })
  @IsDefined({ message: 'permissionId is required' })
  @IsMongoId({ message: 'Invalid permissionId' })
  permissionId: string;

  @ApiProperty({
    required: false,
    enum: ScopeEnum,
    description:
      'GLOBAL applies everywhere; OFFICE confines the permission to the ' +
      'branch the holder is posted to. Defaults to the role’s own scope, ' +
      'which is what nearly every entry wants.',
  })
  @IsOptional()
  @IsEnum(ScopeEnum, { message: 'Scope must be GLOBAL or OFFICE' })
  scope?: ScopeEnum;
}

/**
 * What `PUT /v1/roles/:reference/permissions` accepts: the role's permissions
 * **in full**, not a delta.
 *
 * A whole set rather than add/remove calls because that is what the screen
 * holds — a matrix of ticks — and because two people editing the same role
 * would otherwise interleave into a set neither of them chose. Sending the
 * whole thing makes the last write win as a unit, which is at least a state
 * somebody actually looked at.
 */
export class SetRolePermissionsDto {
  @ApiProperty({
    required: true,
    type: [RolePermissionEntryDto],
    description:
      'Every permission the role is to hold afterwards. An empty array is ' +
      'legal and strips the role back to granting nothing.',
  })
  @IsDefined({ message: 'permissions is required' })
  @IsArray()
  // The whole catalogue is ~120 rows; a payload larger than that is a bug or
  // an attack, not an operator ticking boxes.
  @ArrayMaxSize(500, { message: 'Too many permissions in one request' })
  @ValidateNested({ each: true })
  @Type(() => RolePermissionEntryDto)
  permissions: RolePermissionEntryDto[];
}
