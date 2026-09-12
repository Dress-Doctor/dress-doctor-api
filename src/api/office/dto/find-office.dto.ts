import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';
import { PaginationDto } from 'src/dto/request-data.dto';
import { OfficeTypeEnum } from 'src/schema/office/office.dto';

export class FindOfficeDto extends PaginationDto {
  @ApiProperty({
    required: false,
    example: 'Bonapriso',
    description:
      'Free-text search across officeName, address, city, region, ' +
      'officeCode and slug',
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiProperty({
    required: false,
    enum: OfficeTypeEnum,
    example: OfficeTypeEnum.OFFICE,
    description: 'Office type name. An unknown name returns nothing.',
  })
  @IsOptional()
  @IsEnum(OfficeTypeEnum, { message: 'Invalid officeTypeName' })
  officeTypeName?: OfficeTypeEnum;

  @ApiProperty({
    required: false,
    description:
      'Start of the createdAt range (ISO). Omitted means no lower bound.',
    example: '2026-07-01',
  })
  @IsOptional()
  @IsDateString({}, { message: 'startDate must be an ISO date' })
  startDate?: string;

  @ApiProperty({
    required: false,
    description:
      'End of the createdAt range (ISO). A date without a time covers the ' +
      'whole day. Omitted means no upper bound.',
    example: '2026-08-05',
  })
  @IsOptional()
  @IsDateString({}, { message: 'endDate must be an ISO date' })
  endDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined ? undefined : value === 'true' || value === true,
  )
  @IsBoolean()
  isActive?: boolean;
}
