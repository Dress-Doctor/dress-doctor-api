import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDefined,
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';
import { OrderItemConditionEnum } from 'src/schema/order/order.dto';

export class CreateOrderItemDto {
  @ApiProperty({ required: true, description: 'Item id' })
  @IsDefined({ message: 'itemId is required' })
  @IsMongoId({ message: 'Invalid itemId' })
  itemId: string;

  @ApiProperty({ required: true, description: 'Wash service type id' })
  @IsDefined({ message: 'serviceTypeId is required' })
  @IsMongoId({ message: 'Invalid serviceTypeId' })
  serviceTypeId: string;

  @ApiProperty({ required: true, description: 'Quantity', example: 1 })
  @IsDefined({ message: 'quantity is required' })
  @Transform(({ value }) => Number(value))
  @IsNumber({}, { message: 'Quantity must be a number' })
  @IsPositive({ message: 'Quantity cannot be negative or zero' })
  quantity: number;

  // unitPrice is NOT accepted from the client — it is resolved server-side by
  // the pricing engine and snapshotted onto the line (§6-8).

  @ApiProperty({
    required: false,
    enum: OrderItemConditionEnum,
    description: 'Per-garment condition',
    example: OrderItemConditionEnum.NORMAL,
  })
  @IsOptional()
  @IsEnum(OrderItemConditionEnum, { message: 'Invalid condition' })
  condition?: OrderItemConditionEnum;

  @ApiProperty({ required: false, description: 'Per-garment colour' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  colour?: string;
}

export class OrderParamsDto {
  @ApiProperty({ required: true, description: 'Order id' })
  @IsDefined({ message: 'orderId is required' })
  @IsMongoId({ message: 'Invalid orderId' })
  orderId: string;
}
