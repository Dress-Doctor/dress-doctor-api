import { ApiProperty } from '@nestjs/swagger';
import { ApiSuccessResponseWithPagination } from 'src/dto/swagger.dto';
import { OrderWithItemsEntity } from './order-with-items.entity';

export class OrderStatusBreakdownEntity {
  @ApiProperty({ example: 42, description: 'Total across all statuses' })
  all: number;

  @ApiProperty({ example: 3 })
  draft: number;

  @ApiProperty({ example: 5 })
  confirmed: number;

  @ApiProperty({ example: 4 })
  received: number;

  @ApiProperty({ example: 6 })
  washing: number;

  @ApiProperty({ example: 8 })
  ready: number;

  @ApiProperty({ example: 14 })
  delivered: number;

  @ApiProperty({ example: 2 })
  cancelled: number;
}

export class FindAllOrderWithItemsEntity extends ApiSuccessResponseWithPagination {
  @ApiProperty({
    type: OrderStatusBreakdownEntity,
    description:
      'Order counts per status over the applied filters (date range, keyword, ' +
      'customer, office) — excludes the orderStatus filter so every bucket counts.',
  })
  byOrderStatus: OrderStatusBreakdownEntity;

  @ApiProperty({ type: [OrderWithItemsEntity] })
  data: OrderWithItemsEntity[];
}
