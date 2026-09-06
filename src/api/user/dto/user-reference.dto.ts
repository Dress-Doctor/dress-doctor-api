import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDefined, IsString, Matches, MaxLength } from 'class-validator';

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
