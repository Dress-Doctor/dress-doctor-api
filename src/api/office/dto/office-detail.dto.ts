import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsDefined,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

/**
 * The human-readable office code (`OF-JNYJ`) every by-office read is addressed
 * by. The Mongo `_id` never appears in a URL: the code is what staff read off
 * the branch's own paperwork.
 */
export class OfficeCodeParamsDto {
  @ApiProperty({
    required: true,
    example: 'OF-JNYJ',
    description: 'Human-readable office code',
  })
  @IsDefined({ message: 'officeCode is required' })
  @IsString({ message: 'Invalid officeCode' })
  // Codes are generated upper-case; accepting a lower-case one typed by hand
  // costs nothing and saves a spurious 404.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @MaxLength(50, { message: 'Invalid officeCode' })
  @Matches(/^[A-Z0-9-]+$/, { message: 'Invalid officeCode' })
  officeCode: string;
}

/**
 * The two params `DELETE /v1/offices/:officeCode/users/:userId` carries.
 *
 * Both live in one DTO on purpose. The global pipe runs with
 * `forbidNonWhitelisted`, so it validates the whole params object against
 * whatever `@Param()` names — declaring only `officeCode` there and reading
 * `userId` through a second `@Param('userId')` made every revoke fail with
 * "property userId should not exist" before the handler ever ran.
 */
export class OfficeUserParamsDto extends OfficeCodeParamsDto {
  @ApiProperty({
    required: true,
    description: 'Id of the staff member whose posting is being revoked',
  })
  @IsDefined({ message: 'userId is required' })
  @IsMongoId({ message: 'Invalid userId' })
  userId: string;
}

/**
 * The window every figure on the office dashboard is counted over. Neither
 * bound is defaulted: omitted means no bound, so the page can ask for the
 * office's whole life as easily as for today.
 */
export class OfficeWindowDto {
  @ApiProperty({ required: false, example: '2026-08-01' })
  @IsOptional()
  @IsDateString({}, { message: 'Invalid startDate' })
  startDate?: string;

  @ApiProperty({ required: false, example: '2026-08-27' })
  @IsOptional()
  @IsDateString({}, { message: 'Invalid endDate' })
  endDate?: string;
}

/** Which series the performance chart draws. */
export enum OfficeMetricEnum {
  ORDERS = 'orders',
  PICKUPS = 'pickups',
  COLLECTED = 'collected',
  CUSTOMERS = 'customers',
}

/**
 * How the series is bucketed. One bar or point per bucket, so the same window
 * can be read hour by hour or year by year without changing the window itself.
 */
export enum OfficeIntervalEnum {
  HOURLY = 'hourly',
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly',
  YEARLY = 'yearly',
}

export class OfficePerformanceDto extends OfficeWindowDto {
  @ApiProperty({
    required: false,
    enum: OfficeMetricEnum,
    default: OfficeMetricEnum.ORDERS,
    description: 'Which series to return',
  })
  @IsOptional()
  @IsEnum(OfficeMetricEnum, { message: 'Invalid metric' })
  metric: OfficeMetricEnum = OfficeMetricEnum.ORDERS;

  @ApiProperty({
    required: false,
    enum: OfficeIntervalEnum,
    default: OfficeIntervalEnum.DAILY,
    description: 'How wide one bucket is',
  })
  @IsOptional()
  @IsEnum(OfficeIntervalEnum, { message: 'Invalid interval' })
  interval: OfficeIntervalEnum = OfficeIntervalEnum.DAILY;
}
