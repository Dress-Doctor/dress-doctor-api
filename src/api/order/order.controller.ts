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
import {
  ApiSuccessResponse,
  xApiKey,
  xApiSecret,
  xChangeReason,
} from 'src/dto/swagger.dto';
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
import { OrderCodeParamsDto } from './dto/order-code-params.dto';
import { TransitionOrderDto } from './dto/transition-order.dto';
import { UpdateOrderDraftDto } from './dto/update-order-draft.dto';
import {
  OrderItemParamsDto,
  UpdateOrderItemDto,
} from './dto/update-order-item.dto';
import { FindAllOrderWithItemsEntity } from './entities/find-all-order-with-items.entity';
import { OrderDetailResponseEntity } from './entities/order-detail.entity';
import { OrderItemHistoryResponseEntity } from './entities/order-item-history.entity';
import { OrderCreatedEntity } from './entities/order-created.entity';
import { OrderKpiEntity } from './entities/order-kpi.entity';
import { OrderService } from './order.service';

@ApiHeader(xApiKey)
@Controller('orders')
@ApiHeader(xApiSecret)
@ApiHeader(xChangeReason)
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

  @Get('kpis')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Headline order counts for the dashboard, over the list filters',
    description:
      'Takes the same query params as GET /orders and applies every one of ' +
      'them, so the headline figures describe exactly the set the table is ' +
      'showing (`page`, `size` and `sort` aside). The `byOrderStatus` ' +
      'breakdown is the exception: it is always returned across every status, ' +
      'over the same filters minus `orderStatus`, so a tab strip keeps its ' +
      'counts whichever tab is selected.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: OrderKpiEntity })
  async getOrderKpis(
    @Query() query: FindOrderDto,
    @Req() req: AppRequestWithUser,
  ) {
    const { platform } = req.data;
    this.logger.log(
      `[${platform}] ${req.user.phone} is fetching order kpis with query ${JSON.stringify(query)}`,
    );
    return await this.orderService.getOrderKpis(query);
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

  // Declared after every static GET above so `export`, `kpis` and `flagged`
  // are never read as an order code.
  @Get(':orderCode')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get one order by its code, with its joins and history',
    description:
      'Everything a detail screen shows in one round trip: customer, office, ' +
      'currency, status, creator and pickup agent, the garment lines resolved ' +
      'against the catalog, the linked pickup request, the promo and ' +
      'subscription it was priced against, its payments, and its audit trail. ' +
      'The trail carries only what changed (field, from, to), who changed it ' +
      'and when — never the stored full-order snapshot — newest first, capped ' +
      'at the latest 100 entries. Office/self scoped like the list: an order ' +
      'outside the caller’s scope returns 404.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: OrderDetailResponseEntity })
  async getOrderByCode(
    @Param() { orderCode }: OrderCodeParamsDto,
    @Req() req: AppRequestWithUser,
  ) {
    const { platform } = req.data;
    this.logger.log(
      `[${platform}] ${req.user.phone} is fetching order ${orderCode}`,
    );
    return await this.orderService.findByCode(orderCode);
  }

  @Post('pickup')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create order for a pickup request',
    description:
      'Accepts an optional `items[]` of garments, booked with the order in ' +
      'one transaction — see POST /orders.',
  })
  @CheckAccess(CheckTypeEnum.customerPickup, 'customerId', 'body')
  @ApiResponse({ status: HttpStatus.CREATED, type: OrderCreatedEntity })
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
  @ApiOperation({
    summary: 'Create order without pickup request',
    description:
      'Creates the order in DRAFT. An optional `items[]` books the garments ' +
      'in the same request: every line is validated first, and the order plus ' +
      'its lines are written in one transaction, so a rejected garment leaves ' +
      'no order behind. Items can still be added afterwards through ' +
      'POST /orders/:orderId/items while the order is in DRAFT. Returns the ' +
      'new order id and code.',
  })
  @ApiResponse({ status: HttpStatus.CREATED, type: OrderCreatedEntity })
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
    summary: 'Edit a draft order',
    description: [
      'Everything about a DRAFT is editable — who it is for, where it is',
      'filed, how it is priced, its dates and its note. A draft is the order',
      'before anyone is committed to it: no payment can exist on it, and no',
      'quota or promo has been spent, so there is nothing downstream to',
      'contradict. Anything past DRAFT is refused with ORDER_NOT_DRAFT;',
      'a status move is POST /orders/:orderId/transitions and garments are',
      'the /items endpoints.',
      '',
      'Only the fields sent are touched. The rules booking applies are',
      're-checked here: the office must be one the caller is posted to, the',
      'customer must be in their scope and hold no other draft (DRAFT_EXISTS),',
      'PER_KG needs a weight (WEIGHT_REQUIRED), and `orderAmount`/',
      '`manualDiscount` additionally require UPDATE Payment because they move',
      'what the customer owes. Send `orderAmount: 0` to hand pricing back to',
      'the engine and an empty `note` to clear it.',
      '',
      'The edit and the reprice that follows it share one transaction, so a',
      'reprice the change makes impossible (PRICE_NOT_FOUND when switching to',
      'PER_PIECE with an unpriced garment) leaves the order exactly as it was.',
    ].join(' '),
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

  @Get(':orderId/items/history')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "The audit trail of an order's garments",
    description:
      'Every line added, corrected or removed on this order, newest first ' +
      '(capped at 100 entries). Includes lines that are no longer on the ' +
      'order: a removed garment keeps its trail, and each entry names the ' +
      'garment and what the line held at the time. Readable by whoever may ' +
      'read the order itself.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: OrderItemHistoryResponseEntity })
  async getOrderItemHistory(
    @Req() req: AppRequestWithUser,
    @Param() params: OrderParamsDto,
  ) {
    const { platform } = req.data;
    const phone = req.user.phone;
    this.logger.log(
      `[${platform}] ${phone} is fetching the garment history of order ${params.orderId}`,
    );

    return await this.orderService.findOrderItemHistory(params);
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

  @Post(':orderId/transitions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Move an order to another status',
    description:
      'The one way an order changes status. Send where it should go; a live ' +
      'order may be set to whatever status it is really in, in either ' +
      'direction, so staff who find a bag two steps further along do not have ' +
      'to walk it there one move at a time.\n\n' +
      'Only two rules close anything off:\n\n' +
      '- **DELIVERED and CANCELLED are terminal.** Nothing moves either.\n' +
      '- **DRAFT is never a destination.** A draft is editable and has spent ' +
      'nothing; letting a live order fall back into one would reopen its ' +
      'garments and let its subscription quota and promo be spent twice.\n\n' +
      'Leaving DRAFT for anywhere but CANCELLED requires at least one ' +
      'garment (400 ORDER_EMPTY) and is what takes the subscription quota ' +
      'and promo use; cancelling a live order hands them back and is logged ' +
      'as CANCEL. Anything else is 409 INVALID_STATUS_TRANSITION, whose body ' +
      'lists the statuses that were allowed instead — the same list the ' +
      'detail read publishes as `availableTransitions.allowed`. The ' +
      '`x-change-reason` header is recorded against the entry, so the trail ' +
      'says why as well as what.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: ApiSuccessResponse })
  async transitionOrder(
    @Req() req: AppRequestWithUser,
    @Param() { orderId }: OrderParamsDto,
    @Body() { target }: TransitionOrderDto,
  ) {
    const { platform } = req.data;
    this.logger.log(
      `[${platform}] ${req.user.phone} is moving order ${orderId} to ${target}`,
    );
    return await this.orderService.transitionOrder(orderId, target);
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
