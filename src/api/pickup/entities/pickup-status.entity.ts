import { ApiProperty } from '@nestjs/swagger';

export class PickupStatusEntity {
  @ApiProperty()
  _id: string;

  @ApiProperty({ example: 'PENDING' })
  pickupStatusName: string;

  @ApiProperty()
  description: string;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  updatedAt: string;
}
