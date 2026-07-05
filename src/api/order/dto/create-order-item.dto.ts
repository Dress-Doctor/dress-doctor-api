import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDefined, IsMongoId, IsNumber, IsPositive } from 'class-validator';

export class CreateOrderItemDto {
  @ApiProperty({ required: true, description: 'Item id' })
  @IsDefined({ message: 'itemId is required' })
  @IsMongoId({ message: 'Invalid itemId' })
  itemId: string;

  @ApiProperty({ required: true, description: 'Quantity', example: 1 })
  @IsDefined({ message: 'quantity is required' })
  @Transform(({ value }) => Number(value))
  @IsNumber({}, { message: 'Quantity must be a number' })
  @IsPositive({ message: 'Quantity cannot be negative or zero' })
  quantity: number;

  @ApiProperty({ required: true, description: 'Unit price', example: 500 })
  @IsDefined({ message: 'unitPrice is required' })
  @Transform(({ value }) => Number(value))
  @IsPositive({ message: 'Unit price cannot be negative or zero' })
  @IsNumber({}, { message: 'Unit price must be a number' })
  unitPrice: number;
}

export class OrderParamsDto {
  @ApiProperty({ required: true, description: 'Order id' })
  @IsDefined({ message: 'orderId is required' })
  @IsMongoId({ message: 'Invalid orderId' })
  orderId: string;
}
