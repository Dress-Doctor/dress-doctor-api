import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId, IsOptional } from 'class-validator';
import { PaginationDto } from 'src/dto/request-data.dto';

export class FindPaymentDto extends PaginationDto {
  @ApiProperty({
    required: false,
    description: 'Filter by order id',
    example: '64b8c9f1e4b0a2d3c4f5g6h',
  })
  @IsOptional()
  @IsMongoId({ message: 'Invalid order' })
  orderId?: string;

  @ApiProperty({
    required: false,
    description: 'Filter by payment method',
    example: '64b8c9f1e4b0a2d3c4f5g6h',
  })
  @IsOptional()
  @IsMongoId({ message: 'Invalid paymentMethodId' })
  paymentMethodId?: string;

  @ApiProperty({
    required: false,
    description: 'Filter by payment type',
    example: '64b8c9f1e4b0a2d3c4f5g6h',
  })
  @IsOptional()
  @IsMongoId({ message: 'Invalid paymentTypeId' })
  paymentTypeId?: string;
}
