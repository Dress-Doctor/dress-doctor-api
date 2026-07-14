import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsDefined,
  IsInt,
  IsMongoId,
  IsOptional,
  Min,
} from 'class-validator';

export class CreatePriceDto {
  @ApiProperty({ required: true })
  @IsDefined({ message: 'itemId is required' })
  @IsMongoId({ message: 'Invalid itemId' })
  itemId: string;

  @ApiProperty({ required: true })
  @IsDefined({ message: 'serviceTypeId is required' })
  @IsMongoId({ message: 'Invalid serviceTypeId' })
  serviceTypeId: string;

  @ApiProperty({
    required: false,
    description: 'Omit for company-wide default',
  })
  @IsOptional()
  @IsMongoId({ message: 'Invalid officeId' })
  officeId?: string;

  @ApiProperty({ required: true, example: 1500, description: 'Integer XAF' })
  @IsDefined({ message: 'unitPrice is required' })
  @IsInt({ message: 'unitPrice must be an integer (XAF)' })
  @Min(0, { message: 'unitPrice cannot be negative' })
  unitPrice: number;

  @ApiProperty({ required: true })
  @IsDefined({ message: 'currencyId is required' })
  @IsMongoId({ message: 'Invalid currencyId' })
  currencyId: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'effectiveFrom must be a date' })
  effectiveFrom?: Date;
}
