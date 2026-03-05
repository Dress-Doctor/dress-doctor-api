import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  Put,
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
import { FindOrderDto } from './dto/find-order.dto';
import {
  OrderItemParamsDto,
  UpdateOrderItemDto,
} from './dto/update-order-item.dto';
import { FindAllOrderWithItemsEntity } from './entities/find-all-order-with-items.entity';
import { OrderService } from './order.service';
@ApiHeader(xApiKey)
@Controller('order')
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

  @Put(':orderId/items/:itemId')
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
  // @Get(':orderId/items')
  // @Delete(':orderId/items/:itemId')
}
