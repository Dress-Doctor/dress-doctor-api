import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
} from '@nestjs/swagger';
import { type AppRequestWithUser } from 'src/dto/request-data.dto';
import { ApiSuccessResponse, xApiKey, xApiSecret } from 'src/dto/swagger.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { FindOrderDto } from './dto/find-order.dto';
import { OrderService } from './order.service';
import { FindAllOrderWithItemsEntity } from './entities/find-all-order-with-items.entity';
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
  @ApiQuery({ type: FindOrderDto })
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
  @ApiBody({ type: CreateOrderDto })
  @ApiOperation({ summary: 'Create order for a pickup request' })
  @ApiResponse({ status: HttpStatus.OK, type: ApiSuccessResponse })
  async createOrder(
    @Body() data: CreateOrderDto,
    @Req() req: AppRequestWithUser,
  ) {
    const { platform } = req.data;
    const phone = req.user.phone;
    this.logger.log(
      `[${platform}] ${phone} is creating order for pickup ${data.pickupRequestId} with body ${JSON.stringify(data)}`,
    );
    return await this.orderService.createOrder(data);
  }
}
