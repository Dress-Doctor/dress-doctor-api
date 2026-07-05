import { ApiProperty } from '@nestjs/swagger';
import { PickupStatusEntity } from './pickup-status.entity';

export class PickupRequestEntity {
  @ApiProperty()
  _id: string;

  @ApiProperty()
  apiClientId: string;

  @ApiProperty()
  customerId: string;

  @ApiProperty()
  pickupAddress: string;

  @ApiProperty()
  pickupDate: string;

  @ApiProperty({ example: 'AFTERNOON 12PM - 5PM' })
  pickupTime: string;

  @ApiProperty({ type: PickupStatusEntity })
  pickupStatusId: PickupStatusEntity;

  @ApiProperty()
  officeId: string;

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  updatedAt: string;
}
