import { ApiProperty } from '@nestjs/swagger';
import {
  ApiSuccessResponse,
  ApiSuccessResponseWithPagination,
} from 'src/dto/swagger.dto';
import { PaymentEntity } from './payment.entity';

export class PaymentResponseEntity extends ApiSuccessResponse {
  @ApiProperty({ type: PaymentEntity })
  data: PaymentEntity;
}

export class PaymentListResponseEntity extends ApiSuccessResponseWithPagination {
  @ApiProperty({ type: [PaymentEntity] })
  data: PaymentEntity[];
}
