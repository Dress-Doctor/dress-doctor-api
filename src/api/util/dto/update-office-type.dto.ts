import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * `officeTypeName` is deliberately absent, the same as on every other
 * reference collection.
 *
 * Two places match the two seeded rows by that literal: `api-client.guard.ts`
 * finds FACTORY by name to choose a default office when no `office_ref` cookie
 * is present — and dereferences the result with a non-null assertion, so a
 * rename becomes a runtime TypeError — and `office.service.ts` resolves the
 * office list's `officeTypeName` filter the same way, validated against
 * `OfficeTypeEnum` in `find-office.dto.ts`. Renaming is possible, but only
 * once those two address a type by its id or reference instead.
 *
 * `reference` is absent for the usual reason: minted once, never edited.
 */
export class UpdateOfficeTypeDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @ApiProperty({
    required: false,
    description:
      'Deactivating hides the type from every picker. Existing offices keep ' +
      'it — this is not a delete.',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
