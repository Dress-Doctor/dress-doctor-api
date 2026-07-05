import { ApiProperty } from '@nestjs/swagger';
import { ApiSuccessResponseWithPagination } from 'src/dto/swagger.dto';

export class OrderStatusEntity {
  @ApiProperty({ example: '64b8c9f1e4b0a2d3c4f5g6h' })
  _id: string;

  @ApiProperty({ example: 'PENDING' })
  orderStatusName: string;

  @ApiProperty({ example: 'Order is pending activation', required: false })
  description?: string;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty({ example: '2023-07-21T12:00:00Z' })
  createdAt: string;

  @ApiProperty({ example: '2023-07-21T12:00:00Z' })
  updatedAt: string;
}

export class FindAllOrderStatusEntity extends ApiSuccessResponseWithPagination {
  @ApiProperty({ type: [OrderStatusEntity] })
  data: OrderStatusEntity[];
}
