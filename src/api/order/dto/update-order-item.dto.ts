import { ApiProperty, OmitType, PartialType } from '@nestjs/swagger';
import { IsDefined, IsMongoId } from 'class-validator';
import { CreateOrderItemDto, OrderParamsDto } from './create-order-item.dto';

export class OrderItemParamsDto extends OrderParamsDto {
  // The order-item row's own id — NOT the catalog itemId. Per-garment rows mean
  // several rows can share an itemId, so update/delete must target the row _id.
  @ApiProperty({ required: true, description: 'Order-item row id' })
  @IsDefined({ message: 'orderItemId is required' })
  @IsMongoId({ message: 'Invalid orderItemId' })
  orderItemId: string;
}

export class UpdateOrderItemDto extends PartialType(
  OmitType(CreateOrderItemDto, ['itemId'] as const),
) {}
