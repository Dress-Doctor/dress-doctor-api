import { PartialType } from '@nestjs/swagger';
import { CreatePickupDto } from './create-pickup.dto';

export class UpdatePickupDto extends PartialType(CreatePickupDto) {}
