import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDefined,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class QuoteLineDto {
  @ApiProperty({ required: true, description: 'Catalog item id' })
  @IsDefined({ message: 'itemId is required' })
  @IsMongoId({ message: 'Invalid itemId' })
  itemId: string;

  @ApiProperty({ required: true, description: 'Service type id for this line' })
  @IsDefined({ message: 'serviceTypeId is required' })
  @IsMongoId({ message: 'Invalid serviceTypeId' })
  serviceTypeId: string;

  @ApiProperty({ required: true, example: 2 })
  @IsDefined({ message: 'quantity is required' })
  @IsInt({ message: 'quantity must be an integer' })
  @Min(1, { message: 'quantity must be at least 1' })
  quantity: number;
}

export class QuoteDto {
  @ApiProperty({
    required: false,
    description: 'Office id — omit for company-wide pricing',
  })
  @IsOptional()
  @IsMongoId({ message: 'Invalid officeId' })
  officeId?: string;

  @ApiProperty({ required: false, description: 'Promo code to apply' })
  @IsOptional()
  @IsString()
  promoCode?: string;

  @ApiProperty({ required: true, type: [QuoteLineDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one item is required' })
  @ValidateNested({ each: true })
  @Type(() => QuoteLineDto)
  items: QuoteLineDto[];
}
