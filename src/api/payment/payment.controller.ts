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
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
} from '@nestjs/swagger';
import type { AppRequestWithUser } from 'src/dto/request-data.dto';
import { OrderParamsDto } from '../order/dto/create-order-item.dto';
import {
  PaymentListResponseEntity,
  PaymentResponseEntity,
} from './entities/payment-response.entity';
import { PaymentService } from './payment.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { xApiKey, xApiSecret } from 'src/dto/swagger.dto';
import { FindPaymentDto } from './dto/find-payment.dto';

@Controller()
@ApiHeader(xApiKey)
@ApiHeader(xApiSecret)
@ApiSecurity('x-api-key')
@ApiSecurity('x-api-secret')
@ApiBearerAuth('access-token')
export class PaymentController {
  private logger = new Logger(PaymentController.name);
  constructor(private readonly paymentService: PaymentService) {}

  @Get('payments')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all payments for an order' })
  @ApiResponse({ status: HttpStatus.OK, type: PaymentListResponseEntity })
  async getPayments(
    @Req() req: AppRequestWithUser,
    @Query() query: FindPaymentDto,
  ) {
    const { platform } = req.data;
    const phone = req.user.phone;
    const log = `[${platform}] ${phone} is fetching payments with query ${JSON.stringify(query)}`;
    this.logger.log(log);

    return await this.paymentService.findAll(query);
  }

  @Post('orders/:orderId/payments')
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
}
