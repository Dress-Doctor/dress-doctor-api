import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsMongoId, IsOptional, IsString, Min } from 'class-validator';
import { PaginationDto } from 'src/dto/request-data.dto';

export class FindCustomerDto extends PaginationDto {
  @ApiProperty({
    required: false,
    description: 'Free-text search (name/phone)',
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiProperty({ required: false, description: 'Filter by home office id' })
  @IsOptional()
  @IsMongoId({ message: 'Invalid homeOfficeId' })
  homeOfficeId?: string;

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
