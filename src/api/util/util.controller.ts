import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
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
import {
  type AppRequestWithUser,
  PaginationDto,
} from 'src/dto/request-data.dto';
import { xApiKey, xApiSecret } from 'src/dto/swagger.dto';
import { FindAllCategoryEntity } from './entities/category.entity';
import { FindAllCurrencyEntity } from './entities/currency.entity';
import { FindAllItemEntity } from './entities/item.entity';
import { FindAllOrderStatusEntity } from './entities/order-status.entity';
import { FindAllServiceTypeEntity } from './entities/service-type.entity';
import { FindAllServiceEntity } from './entities/service.entity';
import { FindAllSubCategoryEntity } from './entities/sub-category.entity';
import { FindAllUserTypeEntity } from './entities/user-type.entity';
import { UtilService } from './util.service';

@ApiHeader(xApiKey)
@ApiHeader(xApiSecret)
@Controller('reference')
@ApiSecurity('x-api-key')
@ApiSecurity('x-api-secret')
@ApiBearerAuth('access-token')
export class UtilController {
  private readonly logger = new Logger(UtilController.name);

  constructor(private readonly utilService: UtilService) {}

  @Get('user-types')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all user types' })
  @ApiResponse({ status: HttpStatus.OK, type: FindAllUserTypeEntity })
  async findAllUserType(
    @Query() query: PaginationDto,
    @Req() req: AppRequestWithUser,
  ) {
    const platform = req.data.platform;
    const phone = req.user.phone;

    const log = `[${platform}] ${phone} is getting all user type with query ${JSON.stringify(query)}`;
    this.logger.log(log);

    return await this.utilService.findAllUserType(query);
  }

  @Get('pickup-statuses')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: HttpStatus.OK })
  @ApiOperation({ summary: 'Get all pickup statuses' })
  async findAllPickupStatuses(
    @Query() query: PaginationDto,
    @Req() req: AppRequestWithUser,
  ) {
    const platform = req.data.platform;
    const phone = req.user.phone;

    const log = `[${platform}] ${phone} is getting all admin users with query ${JSON.stringify(query)}`;
    this.logger.log(log);

    return await this.utilService.findAllPickupStatuses(query);
  }

  @Get('categories')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all categories' })
  @ApiResponse({ status: HttpStatus.OK, type: FindAllCategoryEntity })
  async findAllCategories(
    @Query() query: PaginationDto,
    @Req() req: AppRequestWithUser,
  ) {
    const platform = req.data.platform;
    const phone = req.user.phone;

    const log = `[${platform}] ${phone} is getting all categories with query ${JSON.stringify(query)}`;
    this.logger.log(log);

    return await this.utilService.findAllCategories(query);
  }

  @Get('sub-categories')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all sub categories' })
  @ApiResponse({ status: HttpStatus.OK, type: FindAllSubCategoryEntity })
  async findAllSubCategories(
    @Query() query: PaginationDto,
    @Req() req: AppRequestWithUser,
  ) {
    const platform = req.data.platform;
    const phone = req.user.phone;

    const log = `[${platform}] ${phone} is getting all sub categories with query ${JSON.stringify(query)}`;
    this.logger.log(log);

    return await this.utilService.findAllSubCategories(query);
  }

  @Get('services')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all services' })
  @ApiResponse({ status: HttpStatus.OK, type: FindAllServiceEntity })
  async findAllServices(
    @Query() query: PaginationDto,
    @Req() req: AppRequestWithUser,
  ) {
    const platform = req.data.platform;
    const phone = req.user.phone;

    const log = `[${platform}] ${phone} is getting all services with query ${JSON.stringify(query)}`;
    this.logger.log(log);

    return await this.utilService.findAllServices(query);
  }

  @Get('items')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all items' })
  @ApiResponse({ status: HttpStatus.OK, type: FindAllItemEntity })
  async findAllItems(
    @Query() query: PaginationDto,
    @Req() req: AppRequestWithUser,
  ) {
    const platform = req.data.platform;
    const phone = req.user.phone;

    const log = `[${platform}] ${phone} is getting all items with query ${JSON.stringify(query)}`;
    this.logger.log(log);

    return await this.utilService.findAllItems(query);
  }

  @Get('service-types')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all service types' })
  @ApiResponse({ status: HttpStatus.OK, type: FindAllServiceTypeEntity })
  async findAllServiceTypes(
    @Query() query: PaginationDto,
    @Req() req: AppRequestWithUser,
  ) {
    const platform = req.data.platform;
    const phone = req.user.phone;

    const log = `[${platform}] ${phone} is getting all service types with query ${JSON.stringify(query)}`;
    this.logger.log(log);

    return await this.utilService.findAllServiceTypes(query);
  }

  @Get('currencies')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all currencies' })
  @ApiResponse({ status: HttpStatus.OK, type: FindAllCurrencyEntity })
  async findAllCurrencies(
    @Query() query: PaginationDto,
    @Req() req: AppRequestWithUser,
  ) {
    const platform = req.data.platform;
    const phone = req.user.phone;

    const log = `[${platform}] ${phone} is getting all currencies with query ${JSON.stringify(query)}`;
    this.logger.log(log);

    return await this.utilService.findAllCurrencies(query);
  }

  @Get('order-statuses')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all order statuses' })
  @ApiResponse({ status: HttpStatus.OK, type: FindAllOrderStatusEntity })
  async findAllOrderStatuses(
    @Query() query: PaginationDto,
    @Req() req: AppRequestWithUser,
  ) {
    const platform = req.data.platform;
    const phone = req.user.phone;

    const log = `[${platform}] ${phone} is getting all order statuses with query ${JSON.stringify(query)}`;
    this.logger.log(log);

    return await this.utilService.findAllOrderStatuses(query);
  }

  @Get('payment-methods')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all order statuses' })
  @ApiResponse({ status: HttpStatus.OK, type: FindAllOrderStatusEntity })
  async findAllPaymentMethod(
    @Query() query: PaginationDto,
    @Req() req: AppRequestWithUser,
  ) {
    const platform = req.data.platform;
    const phone = req.user.phone;

    const log = `[${platform}] ${phone} is getting all payment method with query ${JSON.stringify(query)}`;
    this.logger.log(log);

    return await this.utilService.findAllPaymentMethod(query);
  }

  @Get('payment-types')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all order statuses' })
  @ApiResponse({ status: HttpStatus.OK, type: FindAllOrderStatusEntity })
  async findAllPaymentTypes(
    @Query() query: PaginationDto,
    @Req() req: AppRequestWithUser,
  ) {
    const platform = req.data.platform;
    const phone = req.user.phone;

    const log = `[${platform}] ${phone} is getting all payment types with query ${JSON.stringify(query)}`;
    this.logger.log(log);

    return await this.utilService.findAllPaymentTypes(query);
  }
}
