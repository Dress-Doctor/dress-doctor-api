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
  Min,
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

  @ApiProperty({
    required: false,
    example: 750.5,
    description:
      'Agreed price for ONE garment on this line; the line is worth ' +
      'unitPrice × quantity. Sent, it overrides the price list and survives ' +
      'later reprices, the same way orderAmount does for the order as a ' +
      'whole. Omit it and the pricing engine resolves the price itself (Per ' +
      'Piece from the catalog; Per KG / Subscription / Free leave it at 0). ' +
      'Setting it requires the same permission as a manual discount.',
  })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'unitPrice must be a number with at most 2 decimals' },
  )
  @Min(0, { message: 'unitPrice cannot be negative' })
  unitPrice?: number;

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
