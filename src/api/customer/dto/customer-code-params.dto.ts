import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDefined, IsString, Matches, MaxLength } from 'class-validator';

/**
 * The human-readable customer code (`CU-A4F92C`) every by-customer read is
 * addressed by. The Mongo `_id` never appears in a URL: the code is what staff
 * read off a receipt and what the customer knows themselves by.
 */
export class CustomerCodeParamsDto {
  @ApiProperty({
    required: true,
    example: 'CU-A4F92C',
    description: 'Human-readable customer code',
  })
  @IsDefined({ message: 'customerCode is required' })
  @IsString({ message: 'Invalid customerCode' })
  // Codes are generated upper-case; accepting a lower-case one typed off a
  // receipt costs nothing and saves a spurious 404.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @MaxLength(50, { message: 'Invalid customerCode' })
  @Matches(/^[A-Z0-9-]+$/, { message: 'Invalid customerCode' })
  customerCode: string;
}
