import { ApiProperty } from '@nestjs/swagger';
import { ApiSuccessResponse } from 'src/dto/swagger.dto';
import { CustomerEntity } from './customer.entity';
import { PickupRequestEntity } from './pickup-request.entity';

class SchedulePickupDataEntity {
  @ApiProperty({ type: CustomerEntity })
  customer: CustomerEntity;

  @ApiProperty({ type: PickupRequestEntity })
  pickupRequest: PickupRequestEntity;
}

export class SchedulePickupEntity extends ApiSuccessResponse {
  @ApiProperty({ type: SchedulePickupDataEntity })
  data: SchedulePickupDataEntity;
}
