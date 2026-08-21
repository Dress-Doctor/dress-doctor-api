import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationDto } from 'src/dto/request-data.dto';
import { PickupStatusEnum } from 'src/schema/pickup/pickup.dto';

export class FindPickupDto extends PaginationDto {
  @ApiProperty({
    required: false,
    enum: PickupStatusEnum,
    description: 'Pickup status name',
    example: PickupStatusEnum.PENDING,
  })
  @IsOptional()
  @IsEnum(PickupStatusEnum, { message: 'Invalid pickupStatusName' })
  pickupStatusName?: PickupStatusEnum;

  @ApiProperty({
    required: false,
    example: 'PU-A4F92C',
    description: 'Pickup reference code',
  })
  @IsOptional()
  @IsString()
  @MaxLength(9, { message: 'Invalid reference code' })
  @MinLength(9, { message: 'Invalid reference code' })
  reference?: string;

  @ApiProperty({
    required: false,
    description: 'Customer user id',
    example: '695fa4b08cdbe03fdce69579',
  })
  @IsOptional()
  @IsMongoId({ message: 'Invalid customerId' })
  customerId?: string;

  @ApiProperty({
    required: false,
    description: 'User id of the staff who confirmed the pickup',
    example: '695fa4b08cdbe03fdce69579',
  })
  @IsOptional()
  @IsMongoId({ message: 'Invalid confirmedById' })
  confirmedById?: string;

  @ApiProperty({
    required: false,
    example: 'DLA-01',
    description: 'Office code',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20, { message: 'Invalid officeCode' })
  officeCode?: string;

  @ApiProperty({
    required: false,
    description: 'Start of the createdAt range (ISO). Defaults to 30 days ago.',
    example: '2026-07-01',
  })
  @IsOptional()
  @IsDateString({}, { message: 'startDate must be an ISO date' })
  startDate?: string;

  @ApiProperty({
    required: false,
    description: 'End of the createdAt range (ISO). Defaults to now.',
    example: '2026-08-05',
  })
  @IsOptional()
  @IsDateString({}, { message: 'endDate must be an ISO date' })
  endDate?: string;

  @ApiProperty({
    required: false,
    example: 'Alice',
    description:
      'Free-text search across customer name, phone, email and pickup reference',
  })
  @IsOptional()
  @IsString()
  keyword?: string;
}
