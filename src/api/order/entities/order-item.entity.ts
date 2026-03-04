import { ApiProperty } from '@nestjs/swagger';

export class OrderItemEntity {
  @ApiProperty({ example: '64b8c9f1e4b0a2d3c4f5g6h' })
  _id: string;

  @ApiProperty({ example: '64b8c9f1e4b0a2d3c4f5g6h' })
  orderId: string;

  @ApiProperty({ example: '64b8c9f1e4b0a2d3c4f5g6h' })
  itemId: string;

  @ApiProperty({ example: 2 })
  quantity: number;

  @ApiProperty({ example: 1500 })
  unitPrice: number;
}
