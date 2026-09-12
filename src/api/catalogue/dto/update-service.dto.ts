import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * `reference` is absent for the usual reason: minted once, never edited.
 *
 * The name IS editable here, unlike the reference collections. Nothing in the
 * platform matches a service by its name — the catalogue is joined by id
 * everywhere — so a correction is a correction, not a silent breakage.
 */
export class UpdateServiceDto {
  @ApiProperty({ required: false, example: 'Wash and Iron' })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @MinLength(2)
  @MaxLength(100)
  serviceName?: string;

  @ApiProperty({ required: false, example: 'Washed, dried and pressed.' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @ApiProperty({
    required: false,
    description:
      'Deactivating hides the row from every picker. Rows already pointing ' +
      'at it keep pointing at it — this is not a delete.',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
