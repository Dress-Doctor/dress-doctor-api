import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDefined, IsString, Matches, MaxLength } from 'class-validator';

/**
 * The human-readable role reference (`RL-JDB6Z7`) every by-role read and write
 * is addressed by. Roles were the last collection still addressed by their
 * Mongo `_id`; `npm run backfill:role-reference` filled the rest in.
 */
export class RoleReferenceParamsDto {
  @ApiProperty({
    required: true,
    example: 'RL-JDB6Z7',
    description: 'Human-readable role reference',
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
