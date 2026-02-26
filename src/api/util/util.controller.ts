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
  ApiQuery,
  ApiResponse,
  ApiSecurity,
} from '@nestjs/swagger';
import {
  type AppRequestWithUser,
  PaginationDto,
} from 'src/dto/request-data.dto';
import { xApiKey, xApiSecret } from 'src/dto/swagger.dto';
import { FindAllUserTypeEntity } from './entities/user-type.entity';
import { FindAllCategoryEntity } from './entities/category.entity';
import { FindAllSubCategoryEntity } from './entities/sub-category.entity';
import { FindAllServiceEntity } from './entities/service.entity';
import { FindAllItemEntity } from './entities/item.entity';
import { FindAllServiceTypeEntity } from './entities/service-type.entity';
import { FindAllCurrencyEntity } from './entities/currency.entity';
import { UtilService } from './util.service';

@Controller('util')
@ApiHeader(xApiKey)
@ApiHeader(xApiSecret)
@ApiSecurity('x-api-key')
@ApiSecurity('x-api-secret')
@ApiBearerAuth('access-token')
export class UtilController {
  private readonly logger = new Logger(UtilController.name);

  constructor(private readonly utilService: UtilService) {}

  @Get('get-all-user-types')
  @HttpCode(HttpStatus.OK)
  @ApiQuery({ type: PaginationDto })
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

  @Get('get-all-pickup-statuses')
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

  @Get('get-all-categories')
  @HttpCode(HttpStatus.OK)
  @ApiQuery({ type: PaginationDto })
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

  @Get('get-all-sub-categories')
  @HttpCode(HttpStatus.OK)
  @ApiQuery({ type: PaginationDto })
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

  @Get('get-all-services')
  @HttpCode(HttpStatus.OK)
  @ApiQuery({ type: PaginationDto })
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

  @Get('get-all-items')
  @HttpCode(HttpStatus.OK)
  @ApiQuery({ type: PaginationDto })
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

  @Get('get-all-service-types')
  @HttpCode(HttpStatus.OK)
  @ApiQuery({ type: PaginationDto })
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

  @Get('get-all-currencies')
  @HttpCode(HttpStatus.OK)
  @ApiQuery({ type: PaginationDto })
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
}
