import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationDto } from 'src/dto/request-data.dto';
import { PreferredLanguageEnum } from 'src/schema/user/user.dto';

export class FindCustomerDto extends PaginationDto {
  @ApiProperty({
    required: false,
    example: 'Alice',
    description:
      'Free-text search across the customer first name, last name, full ' +
      'name, email, phone, whatsapp phone, customerCode and referralCode',
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiProperty({
    required: false,
    example: 'OF-DLA1',
    description:
      'Filter by home office code (reporting only — customers are not ' +
      'office-owned). An unknown code returns nothing.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20, { message: 'Invalid officeCode' })
  officeCode?: string;

  @ApiProperty({
    required: false,
    description:
      'Start of the registeredAt range (ISO). Omitted means no lower bound.',
    example: '2026-07-01',
  })
  @IsOptional()
  @IsDateString({}, { message: 'startDate must be an ISO date' })
  startDate?: string;

  @ApiProperty({
    required: false,
    description:
      'End of the registeredAt range (ISO). A date without a time covers the ' +
      'whole day. Omitted means no upper bound.',
    example: '2026-08-05',
  })
  @IsOptional()
  @IsDateString({}, { message: 'endDate must be an ISO date' })
  endDate?: string;

  @ApiProperty({
    required: false,
    description:
      'Filter by account status — `true` for live accounts, `false` for ' +
      'soft-deleted ones. Omitted returns both.',
  })
  @IsOptional()
  // Query strings carry 'true'/'false' as text. An absent param stays
  // undefined so omitting it means "both", not "the inactive ones".
  @Transform(({ value }) =>
    value === undefined ? undefined : value === 'true' || value === true,
  )
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({
    required: false,
    enum: PreferredLanguageEnum,
    example: PreferredLanguageEnum.FRENCH,
    description: "Filter by the customer's preferred language",
  })
  @IsOptional()
  @IsEnum(PreferredLanguageEnum, { message: 'Invalid language' })
  language?: PreferredLanguageEnum;

  @ApiProperty({
    required: false,
    description: 'Only customers inactive for at least this many days',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'inactiveDays must be a number' })
  @Min(1, { message: 'inactiveDays must be at least 1' })
  inactiveDays?: number;
}
