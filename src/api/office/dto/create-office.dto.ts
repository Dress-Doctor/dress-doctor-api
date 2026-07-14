import { ApiProperty } from '@nestjs/swagger';
import {
  IsDefined,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateOfficeDto {
  @ApiProperty({
    required: true,
    description: 'Office type id (FACTORY|OFFICE)',
  })
  @IsDefined({ message: 'officeTypeId is required' })
  @IsMongoId({ message: 'Invalid officeTypeId' })
  officeTypeId: string;

  @ApiProperty({ required: true, example: 'Bonapriso Branch' })
  @IsDefined({ message: 'officeName is required' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  officeName: string;

  @ApiProperty({ required: true, example: 'bonapriso' })
  @IsDefined({ message: 'slug is required' })
  @IsString()
  @Matches(/^[a-z0-9-]{2,50}$/, {
    message: 'slug must be lowercase letters, digits or dashes',
  })
  slug: string;

  @ApiProperty({ required: true, example: 'Rue 1.234, Bonapriso' })
  @IsDefined({ message: 'address is required' })
  @IsString()
  @MaxLength(255)
  address: string;

  @ApiProperty({ required: true, example: 'Douala' })
  @IsDefined({ message: 'city is required' })
  @IsString()
  @MaxLength(100)
  city: string;

  @ApiProperty({ required: true, example: 'Littoral' })
  @IsDefined({ message: 'region is required' })
  @IsString()
  @MaxLength(100)
  region: string;

  @ApiProperty({ required: false, description: 'QR code image url' })
  @IsOptional()
  @IsString()
  qrCodeUrl?: string;
}
