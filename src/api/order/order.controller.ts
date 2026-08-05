import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Patch,
  Post,
  Put,
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
import { type Response } from 'express';
import { type AppRequestWithUser } from 'src/dto/request-data.dto';
import { ApiSuccessResponse, xApiKey, xApiSecret } from 'src/dto/swagger.dto';
import {
  CheckAccess,
  CheckTypeEnum,
} from 'src/helper/decorator/check-access.decorator';
import {
  CreateOrderItemDto,
  OrderParamsDto,
} from './dto/create-order-item.dto';
import {
  CreateOrderDto,
  CreateOrderWithPickupDto,
} from './dto/create-order.dto';
import { ExportOrderDto } from './dto/export-order.dto';
import { FindOrderDto } from './dto/find-order.dto';
import { UpdateOrderDraftDto } from './dto/update-order-draft.dto';
import {
  OrderItemParamsDto,
  UpdateOrderItemDto,
} from './dto/update-order-item.dto';
import { FindAllOrderWithItemsEntity } from './entities/find-all-order-with-items.entity';
import { OrderService } from './order.service';

@ApiHeader(xApiKey)
@Controller('orders')
@ApiHeader(xApiSecret)
@ApiSecurity('x-api-key')
@ApiSecurity('x-api-secret')
@ApiBearerAuth('access-token')
export class OrderController {
  private readonly logger = new Logger(OrderController.name);
  constructor(private readonly orderService: OrderService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all orders with items and optional filters' })
  @ApiResponse({ status: HttpStatus.OK, type: FindAllOrderWithItemsEntity })
  async getOrders(
    @Query() query: FindOrderDto,
    @Req() req: AppRequestWithUser,
  ) {
    const { platform } = req.data;
    const phone = req.user.phone;
    this.logger.log(
      `[${platform}] ${phone} is fetching orders with query ${JSON.stringify(query)}`,
    );
    return await this.orderService.findAll(query);
  }

  @Get('export')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Export filtered orders as a CSV or Excel download',
  })
  @ApiProduces(
    'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  async exportOrders(
    @Query() query: ExportOrderDto,
    @Req() req: AppRequestWithUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { platform } = req.data;
    this.logger.log(
      `[${platform}] ${req.user.phone} is exporting orders as ${query.format}`,
    );
    const { buffer, filename, contentType } =
      await this.orderService.exportOrders(query);
    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length.toString(),
    });
    return new StreamableFile(buffer);
  }

  @Get('flagged')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Orders with an outstanding balance (by amount+age)',
  })
  @ApiResponse({ status: HttpStatus.OK, type: ApiSuccessResponse })
  async getFlaggedOrders(@Query() query: FindOrderDto) {
    return await this.orderService.findFlagged(query);
  }

  @Post('pickup')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create order for a pickup request' })
  @CheckAccess(CheckTypeEnum.customerPickup, 'customerId', 'body')
  @ApiResponse({ status: HttpStatus.CREATED, type: ApiSuccessResponse })
  async createOrderWithPickup(
    @Body() data: CreateOrderWithPickupDto,
    @Req() req: AppRequestWithUser,
  ) {
    const { platform } = req.data;
    const phone = req.user.phone;
    this.logger.log(
      `[${platform}] ${phone} is creating order for pickup ${data.pickupRequestId} with body ${JSON.stringify(data)}`,
    );
    return await this.orderService.createOrderWithPickup(data);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create order without pickup request' })
  @ApiResponse({ status: HttpStatus.CREATED, type: ApiSuccessResponse })
  async createOrder(
    @Body() data: CreateOrderDto,
    @Req() req: AppRequestWithUser,
  ) {
    const { platform } = req.data;
    const phone = req.user.phone;
    this.logger.log(
      `[${platform}] ${phone} is creating order for customer ${data.customerId} with body ${JSON.stringify(data)}`,
    );
    return await this.orderService.createOrder(data);
  }

  @Patch(':orderId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update draft inputs (weight/manualDiscount/promo)',
  })
  @ApiResponse({ status: HttpStatus.OK, type: ApiSuccessResponse })
  async updateOrderDraft(
    @Param() { orderId }: OrderParamsDto,
    @Body() data: UpdateOrderDraftDto,
  ) {
    return await this.orderService.updateOrderDraft(orderId, data);
  }

  @Post(':orderId/items')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create order items' })
  @ApiResponse({ status: HttpStatus.CREATED, type: ApiSuccessResponse })
  async createOrderItem(
    @Req() req: AppRequestWithUser,
    @Body() data: CreateOrderItemDto,
    @Param() { orderId }: OrderParamsDto,
  ) {
    const { platform } = req.data;
    const phone = req.user.phone;
    const log = `[${platform}] ${phone} is creating order item for order ${orderId} with body ${JSON.stringify(data)}`;
    this.logger.log(log);

    return await this.orderService.createOrderItem(orderId, data);
  }

  @Put(':orderId/items/:orderItemId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update order item' })
  @ApiResponse({ status: HttpStatus.OK, type: ApiSuccessResponse })
  async updateOrderItem(
    @Req() req: AppRequestWithUser,
    @Body() data: UpdateOrderItemDto,
    @Param() params: OrderItemParamsDto,
  ) {
    const { platform } = req.data;
    const phone = req.user.phone;
    const log = `[${platform}] ${phone} is updating order item for order ${params.orderId} with body ${JSON.stringify(data)}`;
    this.logger.log(log);

    return await this.orderService.updateOrderItem(params, data);
  }

  @Delete(':orderId/items/:orderItemId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete order item' })
  @ApiResponse({ status: HttpStatus.OK, type: ApiSuccessResponse })
  async deleteOrderItem(
    @Req() req: AppRequestWithUser,
    @Param() params: OrderItemParamsDto,
  ) {
    const { platform } = req.data;
    const phone = req.user.phone;
    const log = `[${platform}] ${phone} is deleting order item ${params.orderItemId} for order ${params.orderId}`;
    this.logger.log(log);

    return await this.orderService.deleteOrderItem(params);
  }

  @Post(':orderId/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm order (set status to pending)' })
  @ApiResponse({ status: HttpStatus.OK, type: ApiSuccessResponse })
  async confirmOrder(
    @Req() req: AppRequestWithUser,
    @Param() { orderId }: OrderParamsDto,
  ) {
    const { platform } = req.data;
    const phone = req.user.phone;
    const log = `[${platform}] ${phone} is confirming order ${orderId}`;
    this.logger.log(log);

    return await this.orderService.confirmOrder(orderId);
  }

  @Post(':orderId/received')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark order as received at factory' })
  @ApiResponse({ status: HttpStatus.OK, type: ApiSuccessResponse })
  async receiveOrder(
    @Req() req: AppRequestWithUser,
    @Param() { orderId }: OrderParamsDto,
  ) {
    const { platform } = req.data;
    const phone = req.user.phone;
    const log = `[${platform}] ${phone} is marking order ${orderId} as received`;
    this.logger.log(log);

    return await this.orderService.receiveOrder(orderId);
  }

  @Post(':orderId/washing')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start washing an order' })
  @ApiResponse({ status: HttpStatus.OK, type: ApiSuccessResponse })
  async washOrder(
    @Req() req: AppRequestWithUser,
    @Param() { orderId }: OrderParamsDto,
  ) {
    const { platform } = req.data;
    const phone = req.user.phone;
    const log = `[${platform}] ${phone} is starting washing for order ${orderId}`;
    this.logger.log(log);

    return await this.orderService.washOrder(orderId);
  }

  @Post(':orderId/ready')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark order ready for delivery' })
  @ApiResponse({ status: HttpStatus.OK, type: ApiSuccessResponse })
  async readyOrder(
    @Req() req: AppRequestWithUser,
    @Param() { orderId }: OrderParamsDto,
  ) {
    const { platform } = req.data;
    const phone = req.user.phone;
    const log = `[${platform}] ${phone} is marking order ${orderId} ready`;
    this.logger.log(log);

    return await this.orderService.readyOrder(orderId);
  }

  @Post(':orderId/delivered')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark order as delivered to customer' })
  @ApiResponse({ status: HttpStatus.OK, type: ApiSuccessResponse })
  async deliverOrder(
    @Req() req: AppRequestWithUser,
    @Param() { orderId }: OrderParamsDto,
  ) {
    const { platform } = req.data;
    const phone = req.user.phone;
    const log = `[${platform}] ${phone} is marking order ${orderId} delivered`;
    this.logger.log(log);

    return await this.orderService.deliverOrder(orderId);
  }

  @Post(':orderId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel an order' })
  @ApiResponse({ status: HttpStatus.OK, type: ApiSuccessResponse })
  async cancelOrder(
    @Req() req: AppRequestWithUser,
    @Param() { orderId }: OrderParamsDto,
  ) {
    const { platform } = req.data;
    const phone = req.user.phone;
    const log = `[${platform}] ${phone} is cancelling order ${orderId}`;
    this.logger.log(log);

    return await this.orderService.cancelOrder(orderId);
  }
}
