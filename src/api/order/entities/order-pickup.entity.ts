import { ApiProperty } from '@nestjs/swagger';
import { PickupTimeEnum } from 'src/schema/pickup/pickup.dto';

/** The pickup request's status, named rather than left as an id. */
export class OrderPickupStatusEntity {
  @ApiProperty({ example: '64b8c9f1e4b0a2d3c4f5g6h' })
  _id: string;

  @ApiProperty({ example: 'ASSIGNED' })
  pickupStatusName: string;
}

/**
 * The pickup request an order came from, as both the list and the detail view
 * return it: where and when we were asked to collect, and where that request
 * stands. An allow-list — the request's own `apiClientId`, `officeId`,
 * `customerId` and `confirmedBy` are either already on the order or of no use
 * to a screen showing one.
 */
export class OrderPickupEntity {
  @ApiProperty({ example: '64b8c9f1e4b0a2d3c4f5g6h' })
  _id: string;

  @ApiProperty({ example: 'PU-1234' })
  reference: string;

  @ApiProperty({ example: 'Rue 1.234, Bonadale, Douala' })
  pickupAddress: string;

  @ApiProperty({ example: '2026-08-08T00:00:00.000Z' })
  pickupDate: string;

  @ApiProperty({ enum: PickupTimeEnum, example: PickupTimeEnum.MORNING })
  pickupTime: PickupTimeEnum;

  @ApiProperty({
    required: false,
    example: 'Call on arrival, the gate is unmarked.',
  })
  note?: string;

  @ApiProperty({ example: '64b8c9f1e4b0a2d3c4f5g6h' })
  pickupStatusId: string;

  @ApiProperty({ type: OrderPickupStatusEntity, required: false })
  pickupStatus?: OrderPickupStatusEntity;

  @ApiProperty({ example: '2026-08-07T09:12:00.000Z' })
  createdAt: string;
}
