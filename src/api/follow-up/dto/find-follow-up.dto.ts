import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsMongoId, IsOptional } from 'class-validator';
import { PaginationDto } from 'src/dto/request-data.dto';

export class FindFollowUpDto extends PaginationDto {
  @ApiProperty({
    required: false,
    description: 'Filter by customer id',
    example: '64b8c9f1e4b0a2d3c4f5a6b7',
  })
  @IsOptional()
  @IsMongoId({ message: 'Invalid customer' })
  customerId?: string;

  @ApiProperty({
    required: false,
    description: 'true → only unresolved; false → only resolved',
    example: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  resolved?: boolean;
}
