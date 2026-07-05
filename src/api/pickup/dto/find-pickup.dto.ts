import { ApiProperty } from '@nestjs/swagger';
import {
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationDto } from 'src/dto/request-data.dto';

export class FindPickupDto extends PaginationDto {
  @ApiProperty({
    required: false,
    description: 'Pickup status',
    example: '695fa4b08cdbe03fdce69579',
  })
  @IsOptional()
  @IsMongoId({ message: 'Invalid pickupStatusId' })
  pickupStatusId?: string;

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
}
