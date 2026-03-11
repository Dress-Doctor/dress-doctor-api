import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import type { AppRequestWithUser } from 'src/dto/request-data.dto';
import { OrderParamsDto } from '../order/dto/create-order-item.dto';
import { PaymentListResponseEntity } from './entities/payment-response.entity';
import { PaymentService } from './payment.service';

@Controller('payment')
export class PaymentController {
  private logger = new Logger(PaymentController.name);
  constructor(private readonly paymentService: PaymentService) {}

  @Get(':orderId/payments')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all payments for an order' })
  @ApiResponse({ status: HttpStatus.OK, type: PaymentListResponseEntity })
  async getPayments(
    @Req() req: AppRequestWithUser,
    @Param() { orderId }: OrderParamsDto,
    @Query('skip') skip = 0,
    @Query('limit') limit = 10,
  ) {
    const { platform } = req.data;
    const phone = req.user.phone;
    const log = `[${platform}] ${phone} is fetching payments for order ${orderId}`;
    this.logger.log(log);

    return await this.paymentService.getPaymentsForOrder(orderId, skip, limit);
  }
}
