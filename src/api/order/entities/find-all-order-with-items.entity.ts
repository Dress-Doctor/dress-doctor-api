import { ApiProperty } from '@nestjs/swagger';
import { ApiSuccessResponseWithPagination } from 'src/dto/swagger.dto';
import { OrderWithItemsEntity } from './order-with-items.entity';

export class FindAllOrderWithItemsEntity extends ApiSuccessResponseWithPagination {
  @ApiProperty({ type: [OrderWithItemsEntity] })
  data: OrderWithItemsEntity[];
}
