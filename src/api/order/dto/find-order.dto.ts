import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from 'src/dto/request-data.dto';

export class FindOrderDto extends PaginationDto {
  @ApiProperty({
    required: false,
    description: 'Filter by order code (order number)',
    example: 'ORD-001',
  })
  @IsOptional()
  @IsString()
  orderCode?: string;

  @ApiProperty({
    required: false,
    description: 'Filter by customer id',
    example: '64b8c9f1e4b0a2d3c4f5g6h',
  })
  @IsOptional()
  @IsMongoId({ message: 'Invalid customerId' })
  customerId?: string;

  @ApiProperty({
    required: false,
    description: 'Filter by pickup request id',
    example: '64b8c9f1e4b0a2d3c4f5g6h',
  })
  @IsOptional()
  @IsMongoId({ message: 'Invalid pickupRequestId' })
  pickupRequestId?: string;

  @ApiProperty({
    required: false,
    description: 'Filter by order status id',
    example: '64b8c9f1e4b0a2d3c4f5g6h',
  })
  @IsOptional()
  @IsMongoId({ message: 'Invalid orderStatusId' })
  orderStatusId?: string;
}
