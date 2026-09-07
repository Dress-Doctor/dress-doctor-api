import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDefined, IsString, Matches, MaxLength } from 'class-validator';

export class SubCategoryReferenceParamsDto {
  @ApiProperty({
    required: true,
    example: 'SC-A4F92C',
    description: 'Human-readable sub category reference',
  })
  @IsDefined({ message: 'reference is required' })
  @IsString({ message: 'Invalid reference' })
  // References are generated upper-case; accepting a lower-case one typed off
  // a link costs nothing and saves a spurious 404.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @MaxLength(50, { message: 'Invalid reference' })
  @Matches(/^[A-Z0-9-]+$/, { message: 'Invalid reference' })
  reference: string;
}
