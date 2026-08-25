import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiProduces,
  ApiResponse,
  ApiSecurity,
} from '@nestjs/swagger';
import type { Response } from 'express';
import type { AppRequestWithUser } from 'src/dto/request-data.dto';
import { OrderParamsDto } from '../order/dto/create-order-item.dto';
import { PaymentDetailResponseEntity } from './entities/payment-detail.entity';
import { PaymentKpiEntity } from './entities/payment-kpi.entity';
import {
  PaymentListResponseEntity,
  PaymentResponseEntity,
} from './entities/payment-response.entity';
import { PaymentService } from './payment.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { xApiKey, xApiSecret, xChangeReason } from 'src/dto/swagger.dto';
import { ExportPaymentDto } from './dto/export-payment.dto';
import { PaymentReferenceParamsDto } from './dto/payment-reference-params.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { FindPaymentDto } from './dto/find-payment.dto';

@Controller()
@ApiHeader(xApiKey)
@ApiHeader(xApiSecret)
@ApiHeader(xChangeReason)
@ApiSecurity('x-api-key')
@ApiSecurity('x-api-secret')
@ApiBearerAuth('access-token')
export class PaymentController {
  private logger = new Logger(PaymentController.name);
  constructor(private readonly paymentService: PaymentService) {}

  @Get('payments')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all payments' })
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

  @Get('payments/export')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Export filtered payments as a CSV or Excel download',
    description:
      'Takes the same query params as GET /payments and applies every one of ' +
      'them, `page`/`size` aside — an export always spans the full filtered ' +
      'set. Gated on its own EXPORT action, so it can be granted to ' +
      'reporting roles without handing out the rest of the payment rights; ' +
      'the rows stay office-scoped to the caller either way.',
  })
  @ApiProduces(
    'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  async exportPayments(
    @Req() req: AppRequestWithUser,
    @Query() query: ExportPaymentDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { platform } = req.data;
    this.logger.log(
      `[${platform}] ${req.user.phone} is exporting payments as ${query.format}`,
    );
    const { buffer, filename, contentType } =
      await this.paymentService.exportPayments(query);
    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length.toString(),
    });
    return new StreamableFile(buffer);
  }

  @Get('payments/kpis')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Headline payment figures for the dashboard, over the list filters',
    description:
      'Takes the same query params as GET /payments and applies every one of ' +
      'them, so the headline figures describe exactly the set the table is ' +
      'showing (`page`, `size` and `sort` aside).',
  })
  @ApiResponse({ status: HttpStatus.OK, type: PaymentKpiEntity })
  async getPaymentKpis(
    @Req() req: AppRequestWithUser,
    @Query() query: FindPaymentDto,
  ) {
    const { platform } = req.data;
    const phone = req.user.phone;
    const log = `[${platform}] ${phone} is fetching payment kpis with query ${JSON.stringify(query)}`;
    this.logger.log(log);

    return await this.paymentService.getPaymentKpis(query);
  }

  // Declared after every static GET above so `export` and `kpis` are never
  // read as a payment reference.
  @Get('payments/:reference')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get one payment by its reference, with its joins and history',
    description:
      'Everything a detail screen shows in one round trip: the order it ' +
      'settled, the customer, office, currency, type, method and the staff ' +
      'member who took it, each resolved from its id, plus the audit trail. ' +
      'The trail carries what changed, by whom and why — never the stored ' +
      'full-payment snapshot. Office/self scoped like the list, so a payment ' +
      "outside the caller's scope reads as absent (404), not forbidden.",
  })
  @ApiResponse({ status: HttpStatus.OK, type: PaymentDetailResponseEntity })
  async getPaymentByReference(
    @Req() req: AppRequestWithUser,
    @Param() params: PaymentReferenceParamsDto,
  ) {
    const { platform } = req.data;
    const phone = req.user.phone;
    const log = `[${platform}] ${phone} is fetching payment ${params.reference}`;
    this.logger.log(log);

    return await this.paymentService.findByReference(params.reference);
  }

  @Patch('payments/:reference')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Correct a recorded payment (global administrators only)',
    description:
      'Gated on `manage all` — the highest ability there is — not on ' +
      '`UPDATE Payment`, which every cashier holds. Recording money is a ' +
      'counter job; rewriting money already recorded moves a customer’s ' +
      'balance after the fact, so it is reserved for a global administrator. ' +
      'The order’s paid total, balance, payment status and flag are ' +
      'recomputed from the payments that exist, and `paymentPeriod` is ' +
      're-derived whenever `paidAt` moves. The payment type is deliberately ' +
      'not editable: a mistyped payment is reversed with a refund, never ' +
      'rewritten into one.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: PaymentDetailResponseEntity })
  async updatePayment(
    @Req() req: AppRequestWithUser,
    @Param() params: PaymentReferenceParamsDto,
    @Body() data: UpdatePaymentDto,
  ) {
    const { platform } = req.data;
    const phone = req.user.phone;
    const log = `[${platform}] ${phone} is correcting payment ${params.reference} with body ${JSON.stringify(data)}`;
    this.logger.log(log);

    return await this.paymentService.updateByReference(params.reference, data);
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
