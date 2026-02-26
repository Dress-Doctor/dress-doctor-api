import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
} from '@nestjs/swagger';
import type { AppRequestWithUser } from 'src/dto/request-data.dto';
import { ApiSuccessResponse, xApiKey, xApiSecret } from 'src/dto/swagger.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderService } from './order.service';

@Controller('order')
@ApiHeader(xApiKey)
@ApiHeader(xApiSecret)
@ApiSecurity('x-api-key')
@ApiSecurity('x-api-secret')
@ApiBearerAuth('access-token')
export class OrderController {
  private readonly logger = new Logger(OrderController.name);
  constructor(private readonly orderService: OrderService) {}

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
    const phone = req.user?.phone || 'anonymous';
    this.logger.log(
      `[${platform}] ${phone} is creating order for pickup ${data.pickupRequestId} with body ${JSON.stringify(data)}`,
    );
    return await this.orderService.createOrder(data);
  }

  // @Get('pickup/:pickupRequestId')
  // @HttpCode(HttpStatus.OK)
  // @ApiOperation({ summary: 'Get orders for a specific pickup request' })
  // @ApiResponse({
  //   status: HttpStatus.OK,
  //   type: ApiSuccessResponseWithPagination,
  // })
  // async findByPickup(
  //   @Param('pickupRequestId') pickupRequestId: string,
  //   @Req() req: AppRequestWithUser,
  // ) {
  //   const { platform } = req.data;
  //   const phone = req.user?.phone || 'anonymous';
  //   this.logger.log(
  //     `[${platform}] ${phone} is fetching orders for pickup ${pickupRequestId}`,
  //   );
  //   return await this.orderService.findByPickup(pickupRequestId);
  // }

  // @Patch('pickup/:pickupRequestId/:id')
  // @HttpCode(HttpStatus.OK)
  // @ApiBody({ type: UpdateOrderDto })
  // @ApiOperation({ summary: 'Update an order tied to a pickup request' })
  // @ApiResponse({ status: HttpStatus.OK, type: ApiSuccessResponse })
  // async updateForPickup(
  //   @Param('pickupRequestId') pickupRequestId: string,
  //   @Param('id') id: string,
  //   @Body() updateOrderDto: UpdateOrderDto,
  //   @Req() req: AppRequestWithUser,
  // ) {
  //   const { platform } = req.data;
  //   const phone = req.user?.phone || 'anonymous';
  //   this.logger.log(
  //     `[${platform}] ${phone} is updating order ${id} for pickup ${pickupRequestId}`,
  //   );
  //   return await this.orderService.updateForPickup(
  //     pickupRequestId,
  //     id,
  //     updateOrderDto,
  //   );
  // }

  // // generic endpoints kept for backwards compatibility
  // @Post()
  // @HttpCode(HttpStatus.CREATED)
  // @ApiBody({ type: CreateOrderDto })
  // @ApiOperation({ summary: 'Create an order' })
  // @ApiResponse({ status: HttpStatus.OK, type: ApiSuccessResponse })
  // async create(
  //   @Body() createOrderDto: CreateOrderDto,
  //   @Req() req: AppRequestWithUser,
  // ) {
  //   const { platform } = req.data;
  //   const phone = req.user?.phone || 'anonymous';
  //   this.logger.log(`[${platform}] ${phone} is creating a new order`);
  //   return await this.orderService.create(createOrderDto);
  // }

  // @Get()
  // @HttpCode(HttpStatus.OK)
  // @ApiOperation({ summary: 'Get all orders' })
  // @ApiResponse({
  //   status: HttpStatus.OK,
  //   type: ApiSuccessResponseWithPagination,
  // })
  // async findAll(@Req() req: AppRequestWithUser) {
  //   const { platform } = req.data;
  //   const phone = req.user?.phone || 'anonymous';
  //   this.logger.log(`[${platform}] ${phone} is fetching all orders`);
  //   return await this.orderService.findAll();
  // }

  // @Get(':id')
  // @HttpCode(HttpStatus.OK)
  // @ApiOperation({ summary: 'Get order by id' })
  // @ApiResponse({ status: HttpStatus.OK, type: ApiSuccessResponse })
  // async findOne(@Param('id') id: string, @Req() req: AppRequestWithUser) {
  //   const { platform } = req.data;
  //   const phone = req.user?.phone || 'anonymous';
  //   this.logger.log(`[${platform}] ${phone} is fetching order ${id}`);
  //   return await this.orderService.findOne(id);
  // }

  // @Patch(':id')
  // @HttpCode(HttpStatus.OK)
  // @ApiBody({ type: UpdateOrderDto })
  // @ApiOperation({ summary: 'Update order by id' })
  // @ApiResponse({ status: HttpStatus.OK, type: ApiSuccessResponse })
  // async update(
  //   @Param('id') id: string,
  //   @Body() updateOrderDto: UpdateOrderDto,
  //   @Req() req: AppRequestWithUser,
  // ) {
  //   const { platform } = req.data;
  //   const phone = req.user?.phone || 'anonymous';
  //   this.logger.log(`[${platform}] ${phone} is updating order ${id}`);
  //   return await this.orderService.update(id, updateOrderDto);
  // }

  // @Delete(':id')
  // @HttpCode(HttpStatus.OK)
  // @ApiOperation({ summary: 'Remove order by id' })
  // @ApiResponse({ status: HttpStatus.OK, type: ApiSuccessResponse })
  // async remove(@Param('id') id: string, @Req() req: AppRequestWithUser) {
  //   const { platform } = req.data;
  //   const phone = req.user?.phone || 'anonymous';
  //   this.logger.log(`[${platform}] ${phone} is deleting order ${id}`);
  //   return await this.orderService.remove(id);
  // }
}
