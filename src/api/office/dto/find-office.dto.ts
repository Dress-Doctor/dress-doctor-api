import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsMongoId, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from 'src/dto/request-data.dto';

export class FindOfficeDto extends PaginationDto {
  @ApiProperty({ required: false, description: 'Free-text search (name/city)' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsMongoId({ message: 'Invalid officeTypeId' })
  officeTypeId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isActive?: boolean;
}
