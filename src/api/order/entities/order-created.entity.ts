import { ApiProperty } from '@nestjs/swagger';
import { ApiSuccessResponse } from 'src/dto/swagger.dto';

/**
 * What order creation hands back so the caller can address the order it just
 * booked. Both create endpoints used to return a bare message with no `data`
 * at all, which left a client with nothing to link to and no way to add
 * garments afterwards except by re-querying the customer's only draft.
 */
export class OrderCreatedDataEntity {
  @ApiProperty({
    example: '507f1f77bcf86cd799439011',
    description: 'Order id — use it for /orders/:orderId/* follow-ups',
  })
  _id: string;

  @ApiProperty({
    example: 'OR-000123',
    description: 'Human-readable order reference',
  })
  orderCode: string;
}

export class OrderCreatedEntity extends ApiSuccessResponse {
  @ApiProperty({ type: OrderCreatedDataEntity })
  data: OrderCreatedDataEntity;
}
