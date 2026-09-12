import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDefined,
  IsMongoId,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

/**
 * The human-readable user reference (`US-8KQTMR`) every by-user read and write
 * is addressed by. A mongo `_id` is still accepted by the service behind it, so
 * callers written against the old `:id` routes keep working — but nothing new
 * should put a 24-character id in a URL.
 */
export class UserReferenceParamsDto {
  @ApiProperty({
    required: true,
    example: 'US-8KQTMR',
    description: 'Human-readable user reference',
  })
  @IsDefined({ message: 'reference is required' })
  @IsString({ message: 'Invalid reference' })
  // References are generated upper-case; accepting a lower-case one typed by
  // hand costs nothing and saves a spurious 404.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @MaxLength(50, { message: 'Invalid reference' })
  @Matches(/^[A-Z0-9-]+$/, { message: 'Invalid reference' })
  reference: string;
}

/**
 * The two params `DELETE /v1/users/:reference/roles/:roleId` carries.
 *
 * Both live in one DTO on purpose. The global pipe runs with
 * `forbidNonWhitelisted`, so it validates the whole params object against
 * whatever `@Param()` names — declaring only `reference` there and reading
 * `roleId` through a second `@Param('roleId')` made every revoke fail with
 * "property roleId should not exist" before the handler ever ran.
 */
export class UserRoleParamsDto extends UserReferenceParamsDto {
  @ApiProperty({
    required: true,
    description: 'Id of the role to revoke',
  })
  @IsDefined({ message: 'roleId is required' })
  @IsMongoId({ message: 'Invalid roleId' })
  roleId: string;
}
