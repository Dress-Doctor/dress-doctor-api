import { ApiProperty } from '@nestjs/swagger';
import { IsDefined, IsEnum } from 'class-validator';
import { OrderStatusEnum } from 'src/schema/order/order.dto';

export class TransitionOrderDto {
  @ApiProperty({
    required: true,
    enum: OrderStatusEnum,
    example: OrderStatusEnum.RECEIVED,
    description:
      'The status to move the order to. Name the destination only — whether ' +
      'that is normal progress, a correction of a mistake, or a cancellation ' +
      "is decided by the server from the order's current status, so a client " +
      'cannot record a correction as ordinary progress. Anything the workflow ' +
      'does not allow from where the order stands is rejected with 409 ' +
      'INVALID_STATUS_TRANSITION, which lists what was allowed instead.',
  })
  @IsDefined({ message: 'target is required' })
  @IsEnum(OrderStatusEnum, { message: 'Invalid target status' })
  target: OrderStatusEnum;
}
