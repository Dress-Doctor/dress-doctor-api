import { ApiProperty } from '@nestjs/swagger';
import { ApiSuccessResponse } from 'src/dto/swagger.dto';
import { OrderHistoryEntryEntity } from './order-detail.entity';

/** The catalog garment a history entry was about, named. */
export class OrderItemHistoryItemEntity {
  @ApiProperty({ example: '64b8c9f1e4b0a2d3c4f5g6h' })
  _id: string;

  @ApiProperty({ required: false, example: 'Dress' })
  itemName?: string;
}

/**
 * One entry of a garment line's audit trail. Everything the order's own trail
 * carries, plus which line it was about and what that line held at the time —
 * a removed line's row is deleted outright, so an entry that named only an id
 * would be unreadable exactly where it matters most.
 */
export class OrderItemHistoryEntryEntity extends OrderHistoryEntryEntity {
  @ApiProperty({
    example: '64b8c9f1e4b0a2d3c4f5g6h',
    description:
      'The line this entry is about. It may no longer exist: a garment ' +
      'removed from the order keeps its trail.',
  })
  orderItemId: string;

  @ApiProperty({ type: OrderItemHistoryItemEntity, required: false })
  item?: OrderItemHistoryItemEntity;

  @ApiProperty({
    required: false,
    example: 2,
    description: 'The line as this entry left it — useful on CREATE/DELETE.',
  })
  quantity?: number;

  @ApiProperty({ required: false, example: 'Navy blue' })
  colour?: string;

  @ApiProperty({ required: false, example: 'Stained' })
  condition?: string;
}

export class OrderItemHistoryResponseEntity extends ApiSuccessResponse {
  @ApiProperty({ type: [OrderItemHistoryEntryEntity] })
  data: OrderItemHistoryEntryEntity[];
}
