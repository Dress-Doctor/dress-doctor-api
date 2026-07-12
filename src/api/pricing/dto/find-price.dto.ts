import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId, IsOptional } from 'class-validator';
import { PaginationDto } from 'src/dto/request-data.dto';

export class FindPriceDto extends PaginationDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsMongoId({ message: 'Invalid itemId' })
  itemId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsMongoId({ message: 'Invalid serviceTypeId' })
  serviceTypeId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsMongoId({ message: 'Invalid officeId' })
  officeId?: string;
}
