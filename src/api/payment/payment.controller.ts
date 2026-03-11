import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentService } from './payment.service';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import type { AppRequestWithUser } from 'src/dto/request-data.dto';
import { OrderParamsDto } from '../order/dto/create-order-item.dto';
import { RefundPaymentDto } from './dto/refund-payment.dto';
import {
  PaymentResponseEntity,
  PaymentListResponseEntity,
} from './entities/payment-response.entity';

@Controller('payment')
export class PaymentController {
  private logger = new Logger(PaymentController.name);
  constructor(private readonly paymentService: PaymentService) {}

  @Post(':orderId/payments')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a payment for an order' })
  @ApiResponse({ status: HttpStatus.CREATED, type: PaymentResponseEntity })
  async createPayment(
    @Req() req: AppRequestWithUser,
    @Body() data: CreatePaymentDto,
    @Param() params: OrderParamsDto,
  ) {
    const { platform } = req.data;
    const phone = req.user.phone;
    const log = `[${platform}] ${phone} is creating payment for order ${params.orderId} with body ${JSON.stringify(data)}`;
    this.logger.log(log);

    return await this.paymentService.createPaymentForOrder(params, data);
  }

  @Post(':orderId/payments/:paymentId/refund')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refund a payment' })
  @ApiResponse({ status: HttpStatus.OK, type: PaymentResponseEntity })
  async refundPayment(
    @Req() req: AppRequestWithUser,
    @Param('orderId') orderId: string,
    @Param('paymentId') paymentId: string,
    @Body() data: RefundPaymentDto,
  ) {
    const { platform } = req.data;
    const phone = req.user.phone;
    const log = `[${platform}] ${phone} is refunding payment ${paymentId} for order ${orderId} with body ${JSON.stringify(data)}`;
    this.logger.log(log);

    return await this.paymentService.refundPayment(orderId, paymentId, data);
  }

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
