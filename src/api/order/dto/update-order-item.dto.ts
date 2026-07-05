import { ApiProperty, OmitType, PartialType } from '@nestjs/swagger';
import { IsDefined, IsMongoId } from 'class-validator';
import { CreateOrderItemDto, OrderParamsDto } from './create-order-item.dto';

export class OrderItemParamsDto extends OrderParamsDto {
  @ApiProperty({ required: true, description: 'Item id' })
  @IsDefined({ message: 'itemId is required' })
  @IsMongoId({ message: 'Invalid itemId' })
  itemId: string;
}

export class UpdateOrderItemDto extends PartialType(
  OmitType(CreateOrderItemDto, ['itemId'] as const),
) {}
