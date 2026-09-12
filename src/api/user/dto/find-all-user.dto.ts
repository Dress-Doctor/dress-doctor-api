import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsDateString, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from 'src/dto/request-data.dto';

/**
 * The staff file's query. Extends `PaginationDto` rather than restating
 * `page`/`size`/`sort`, so the bounds are the same ones every other list on
 * the platform uses (`size` ≤ 100) and a default page is a default page
 * everywhere.
 */
export class FindAllUserDto extends PaginationDto {
  // No `userType` filter: this module answers for staff and nobody else, so
  // there is no second type to narrow to. Customers are read through
  // `/v1/customers`, which is the endpoint that knows about orders, spend and
  // a home office.

  @ApiProperty({
    required: false,
    example: 'jane',
    description:
      'Free-text search on reference, first name, last name, email, phone ' +
      'or whatsapp phone',
  })
  @IsOptional()
  @IsString()
  q?: string;

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

  @ApiProperty({
    required: false,
    description: 'User status. Omitted returns both.',
  })
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined ? undefined : value === 'true' || value === true,
  )
  @IsBoolean()
  isActive?: boolean;
}
