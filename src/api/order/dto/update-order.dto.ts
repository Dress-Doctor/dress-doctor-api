import { PartialType } from '@nestjs/swagger';
import { CreateOrderWithPickupDto } from './create-order.dto';

export class UpdateOrderDto extends PartialType(CreateOrderWithPickupDto) {}
