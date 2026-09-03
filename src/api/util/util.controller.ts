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
import { xApiKey, xApiSecret, xChangeReason } from 'src/dto/swagger.dto';
import { CreateOfficeTypeDto } from './dto/create-office-type.dto';
import { CreatePaymentMethodDto } from './dto/create-payment-method.dto';
import { CreatePaymentTypeDto } from './dto/create-payment-type.dto';
import { CreateOrderStatusDto } from './dto/create-order-status.dto';
import { CreatePickupStatusDto } from './dto/create-pickup-status.dto';
import { CreateUserTypeDto } from './dto/create-user-type.dto';
import { FindOfficeTypeDto } from './dto/find-office-type.dto';
import { FindPaymentMethodDto } from './dto/find-payment-method.dto';
import { FindPaymentTypeDto } from './dto/find-payment-type.dto';
import { FindOrderStatusDto } from './dto/find-order-status.dto';
import { FindPickupStatusDto } from './dto/find-pickup-status.dto';
import { OfficeTypeReferenceParamsDto } from './dto/office-type-params.dto';
import { PaymentMethodReferenceParamsDto } from './dto/payment-method-params.dto';
import { PaymentTypeReferenceParamsDto } from './dto/payment-type-params.dto';
import { OrderStatusReferenceParamsDto } from './dto/order-status-params.dto';
import { PickupStatusReferenceParamsDto } from './dto/pickup-status-params.dto';
import { UpdateOfficeTypeDto } from './dto/update-office-type.dto';
import { UpdatePaymentMethodDto } from './dto/update-payment-method.dto';
import { UpdatePaymentTypeDto } from './dto/update-payment-type.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { UpdatePickupStatusDto } from './dto/update-pickup-status.dto';
import { FindUserTypeDto } from './dto/find-user-type.dto';
import { UpdateUserTypeDto } from './dto/update-user-type.dto';
import { UserTypeReferenceParamsDto } from './dto/user-type-params.dto';
import { FindAllCategoryEntity } from './entities/category.entity';
import {
  FindAllPickupStatusEntity,
  PickupStatusDetailEntity,
  PickupStatusKpiEntity,
} from './entities/pickup-status.entity';
import { FindAllCurrencyEntity } from './entities/currency.entity';
import { FindAllItemEntity } from './entities/item.entity';
import {
  FindAllPaymentMethodEntity,
  PaymentMethodDetailEntity,
  PaymentMethodKpiEntity,
} from './entities/payment-method.entity';
import {
  FindAllPaymentTypeEntity,
  PaymentTypeDetailEntity,
  PaymentTypeKpiEntity,
} from './entities/payment-type.entity';
import {
  FindAllOfficeTypeEntity,
  OfficeTypeDetailEntity,
  OfficeTypeKpiEntity,
} from './entities/office-type.entity';
import {
  FindAllOrderStatusEntity,
  OrderStatusDetailEntity,
  OrderStatusKpiEntity,
} from './entities/order-status.entity';
import { FindAllServiceTypeEntity } from './entities/service-type.entity';
import { FindAllServiceEntity } from './entities/service.entity';
import { FindAllSubCategoryEntity } from './entities/sub-category.entity';
import {
  FindAllUserTypeEntity,
  UserTypeDetailEntity,
  UserTypeKpiEntity,
} from './entities/user-type.entity';
import { UtilService } from './util.service';

@ApiHeader(xApiKey)
@ApiHeader(xApiSecret)
@ApiHeader(xChangeReason)
@Controller('reference')
@ApiSecurity('x-api-key')
@ApiSecurity('x-api-secret')
@ApiBearerAuth('access-token')
export class UtilController {
  private readonly logger = new Logger(UtilController.name);

  constructor(private readonly utilService: UtilService) {}

  @Get('user-types')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get all user types',
    description:
      "Doubles as the picker lookup and as the reference screen's table, " +
      'so it takes `q` (free text over `reference` and `userTypeName`) and ' +
      '`isActive` on top of the usual paging.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: FindAllUserTypeEntity })
  async findAllUserType(
    @Query() query: FindUserTypeDto,
    @Req() req: AppRequestWithUser,
  ) {
    const platform = req.data.platform;
    const phone = req.user.phone;

    const log = `[${platform}] ${phone} is getting all user type with query ${JSON.stringify(query)}`;
    this.logger.log(log);

    return await this.utilService.findAllUserType(query);
  }

  @Get('user-types/kpis')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Headline user type counts, over the list filters',
    description:
      'Takes the same query params as GET /reference/user-types. `total` ' +
      'respects every filter, `isActive` included. `byStatus` is the ' +
      'exception: it is counted over the same filters minus `isActive`, so ' +
      'the status tab strip keeps every count whichever tab is selected. ' +
      '`totalActive` and `totalInactive` are that breakdown restated as ' +
      'flat figures.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: UserTypeKpiEntity })
  async getUserTypeKpis(
    @Query() query: FindUserTypeDto,
    @Req() req: AppRequestWithUser,
  ) {
    const platform = req.data.platform;
    const phone = req.user.phone;

    const log = `[${platform}] ${phone} is getting user type kpis with query ${JSON.stringify(query)}`;
    this.logger.log(log);

    return await this.utilService.getUserTypeKpis(query);
  }

  @Post('user-types')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Add a user type',
    description:
      'The name is stored upper-case, so "Admin" beside the seeded "ADMIN" ' +
      'is a conflict rather than a second row.',
  })
  @ApiResponse({ status: HttpStatus.CREATED, type: UserTypeDetailEntity })
  async createUserType(
    @Body() data: CreateUserTypeDto,
    @Req() req: AppRequestWithUser,
  ) {
    const platform = req.data.platform;
    const phone = req.user.phone;

    const log = `[${platform}] ${phone} is creating a user type with body ${JSON.stringify(data)}`;
    this.logger.log(log);

    return await this.utilService.createUserType(data);
  }

  // Declared after every static route above so `kpis` is never read as a
  // user type reference.
  @Get('user-types/:reference')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get one user type by its reference, with its history',
    description:
      'Everything the detail panel shows in one round trip: the row, how ' +
      'many users currently hold it, and the audit trail — what changed, by ' +
      'whom and why, with the staff member resolved from `changedBy`. The ' +
      'stored snapshot is never returned.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: UserTypeDetailEntity })
  async findUserTypeByReference(
    @Param() params: UserTypeReferenceParamsDto,
    @Req() req: AppRequestWithUser,
  ) {
    const platform = req.data.platform;
    const phone = req.user.phone;

    const log = `[${platform}] ${phone} is getting user type ${params.reference}`;
    this.logger.log(log);

    return await this.utilService.findUserTypeByReference(params.reference);
  }

  @Patch('user-types/:reference')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reword a user type, or switch it on and off',
    description:
      '`userTypeName` is deliberately not editable: `auth.service` puts it ' +
      'into the JWT as the `userType` claim and compares it against ' +
      '`UserTypeEum.CUSTOMER`, and `user.service`, `pickup.service` and ' +
      '`customer.service` match the seeded rows by that exact string, so a ' +
      'rename would strip a signed-in user of their permissions with no sign ' +
      'of why. Deactivating is not a delete: the row stays and the users ' +
      'holding it keep holding it, it simply stops being offered by the ' +
      'pickers. There is no delete on purpose — removing a type users still ' +
      'point at would leave them pointing at nothing.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: UserTypeDetailEntity })
  async updateUserType(
    @Param() params: UserTypeReferenceParamsDto,
    @Body() data: UpdateUserTypeDto,
    @Req() req: AppRequestWithUser,
  ) {
    const platform = req.data.platform;
    const phone = req.user.phone;

    const log = `[${platform}] ${phone} is updating user type ${params.reference} with body ${JSON.stringify(data)}`;
    this.logger.log(log);

    return await this.utilService.updateUserType(params.reference, data);
  }

  @Get('pickup-statuses')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: HttpStatus.OK, type: FindAllPickupStatusEntity })
  @ApiOperation({
    summary: 'Get all pickup statuses',
    description:
      "Doubles as the picker lookup and as the reference screen's table, so " +
      'it takes `q` (free text over `reference` and `pickupStatusName`) and ' +
      '`isActive` on top of the usual paging.',
  })
  async findAllPickupStatuses(
    @Query() query: FindPickupStatusDto,
    @Req() req: AppRequestWithUser,
  ) {
    const platform = req.data.platform;
    const phone = req.user.phone;

    const log = `[${platform}] ${phone} is getting all pickup statuses with query ${JSON.stringify(query)}`;
    this.logger.log(log);

    return await this.utilService.findAllPickupStatuses(query);
  }

  @Get('pickup-statuses/kpis')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Headline pickup status counts, over the list filters',
    description:
      'Takes the same query params as GET /reference/pickup-statuses. ' +
      '`total` respects every filter, `isActive` included. `byStatus` is the ' +
      'exception: it is counted over the same filters minus `isActive`, so ' +
      'the status tab strip keeps every count whichever tab is selected. ' +
      '`totalActive` and `totalInactive` are that breakdown restated as flat ' +
      'figures.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: PickupStatusKpiEntity })
  async getPickupStatusKpis(
    @Query() query: FindPickupStatusDto,
    @Req() req: AppRequestWithUser,
  ) {
    const platform = req.data.platform;
    const phone = req.user.phone;

    const log = `[${platform}] ${phone} is getting pickup status kpis with query ${JSON.stringify(query)}`;
    this.logger.log(log);

    return await this.utilService.getPickupStatusKpis(query);
  }

  @Post('pickup-statuses')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Add a pickup status',
    description:
      'The name is stored upper-case, so "Pending" beside the seeded ' +
      '"PENDING" is a conflict rather than a second row. A status added here ' +
      'is inert until something assigns it: the pickup and order services ' +
      'only ever look up the five names in `PickupStatusEnum`.',
  })
  @ApiResponse({ status: HttpStatus.CREATED, type: PickupStatusDetailEntity })
  async createPickupStatus(
    @Body() data: CreatePickupStatusDto,
    @Req() req: AppRequestWithUser,
  ) {
    const platform = req.data.platform;
    const phone = req.user.phone;

    const log = `[${platform}] ${phone} is creating a pickup status with body ${JSON.stringify(data)}`;
    this.logger.log(log);

    return await this.utilService.createPickupStatus(data);
  }

  // Declared after every static route above so `kpis` is never read as a
  // pickup status reference.
  @Get('pickup-statuses/:reference')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get one pickup status by its reference, with its history',
    description:
      'Everything the detail panel shows in one round trip: the row, how ' +
      'many pickup requests currently sit at it, and the audit trail — what ' +
      'changed, by whom and why, with the staff member resolved from ' +
      '`changedBy`. The stored snapshot is never returned.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: PickupStatusDetailEntity })
  async findPickupStatusByReference(
    @Param() params: PickupStatusReferenceParamsDto,
    @Req() req: AppRequestWithUser,
  ) {
    const platform = req.data.platform;
    const phone = req.user.phone;

    const log = `[${platform}] ${phone} is getting pickup status ${params.reference}`;
    this.logger.log(log);

    return await this.utilService.findPickupStatusByReference(params.reference);
  }

  @Patch('pickup-statuses/:reference')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reword a pickup status, or switch it on and off',
    description:
      '`pickupStatusName` is deliberately not editable: `pickup.service` and ' +
      '`order.service` match the seeded rows by that exact string against ' +
      '`PickupStatusEnum`, so a rename would break creating a pickup with no ' +
      'sign of why. Deactivating only hides the status from the pickers — ' +
      'the services still assign it by name. There is no delete: a status ' +
      'live collections are parked on cannot be removed without orphaning ' +
      'them.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: PickupStatusDetailEntity })
  async updatePickupStatus(
    @Param() params: PickupStatusReferenceParamsDto,
    @Body() data: UpdatePickupStatusDto,
    @Req() req: AppRequestWithUser,
  ) {
    const platform = req.data.platform;
    const phone = req.user.phone;

    const log = `[${platform}] ${phone} is updating pickup status ${params.reference} with body ${JSON.stringify(data)}`;
    this.logger.log(log);

    return await this.utilService.updatePickupStatus(params.reference, data);
  }

  @Get('office-types')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: HttpStatus.OK, type: FindAllOfficeTypeEntity })
  @ApiOperation({
    summary: 'Get all office types',
    description:
      "Doubles as the picker lookup and as the reference screen's table, so " +
      'it takes `q` (free text over `reference` and `officeTypeName`) and ' +
      '`isActive` on top of the usual paging.',
  })
  async findAllOfficeTypes(
    @Query() query: FindOfficeTypeDto,
    @Req() req: AppRequestWithUser,
  ) {
    const platform = req.data.platform;
    const phone = req.user.phone;

    const log = `[${platform}] ${phone} is getting all office types with query ${JSON.stringify(query)}`;
    this.logger.log(log);

    return await this.utilService.findAllOfficeTypes(query);
  }

  @Get('office-types/kpis')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Headline office type counts, over the list filters',
    description:
      'Takes the same query params as GET /reference/office-types. `total` ' +
      'respects every filter, `isActive` included. `byStatus` is the ' +
      'exception: it is counted over the same filters minus `isActive`, so ' +
      'the status tab strip keeps every count whichever tab is selected. ' +
      '`totalActive` and `totalInactive` are that breakdown restated as flat ' +
      'figures.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: OfficeTypeKpiEntity })
  async getOfficeTypeKpis(
    @Query() query: FindOfficeTypeDto,
    @Req() req: AppRequestWithUser,
  ) {
    const platform = req.data.platform;
    const phone = req.user.phone;

    const log = `[${platform}] ${phone} is getting office type kpis with query ${JSON.stringify(query)}`;
    this.logger.log(log);

    return await this.utilService.getOfficeTypeKpis(query);
  }

  @Post('office-types')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Add an office type',
    description:
      'The name is stored upper-case, so "Factory" beside the seeded ' +
      '"FACTORY" is a conflict rather than a second row. Unlike a new status, ' +
      'a new office type is usable at once: `POST /offices` takes whatever ' +
      '`officeTypeId` it is given.',
  })
  @ApiResponse({ status: HttpStatus.CREATED, type: OfficeTypeDetailEntity })
  async createOfficeType(
    @Body() data: CreateOfficeTypeDto,
    @Req() req: AppRequestWithUser,
  ) {
    const platform = req.data.platform;
    const phone = req.user.phone;

    const log = `[${platform}] ${phone} is creating an office type with body ${JSON.stringify(data)}`;
    this.logger.log(log);

    return await this.utilService.createOfficeType(data);
  }

  // Declared after every static route above so `kpis` is never read as an
  // office type reference.
  @Get('office-types/:reference')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get one office type by its reference, with its history',
    description:
      'Everything the detail panel shows in one round trip: the row, how ' +
      'many offices are of this type, and the audit trail — what changed, by ' +
      'whom and why, with the staff member resolved from `changedBy`. The ' +
      'stored snapshot is never returned.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: OfficeTypeDetailEntity })
  async findOfficeTypeByReference(
    @Param() params: OfficeTypeReferenceParamsDto,
    @Req() req: AppRequestWithUser,
  ) {
    const platform = req.data.platform;
    const phone = req.user.phone;

    const log = `[${platform}] ${phone} is getting office type ${params.reference}`;
    this.logger.log(log);

    return await this.utilService.findOfficeTypeByReference(params.reference);
  }

  @Patch('office-types/:reference')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reword an office type, or switch it on and off',
    description:
      '`officeTypeName` is deliberately not editable: `api-client.guard.ts` ' +
      'picks a default office by finding FACTORY by name and dereferences ' +
      'the result with a non-null assertion, so a rename becomes a runtime ' +
      "TypeError, and `office.service.ts` resolves the office list's " +
      '`officeTypeName` filter the same way. There is no delete either: a ' +
      'type offices still point at is switched off, never removed.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: OfficeTypeDetailEntity })
  async updateOfficeType(
    @Param() params: OfficeTypeReferenceParamsDto,
    @Body() data: UpdateOfficeTypeDto,
    @Req() req: AppRequestWithUser,
  ) {
    const platform = req.data.platform;
    const phone = req.user.phone;

    const log = `[${platform}] ${phone} is updating office type ${params.reference} with body ${JSON.stringify(data)}`;
    this.logger.log(log);

    return await this.utilService.updateOfficeType(params.reference, data);
  }

  @Get('roles')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: HttpStatus.OK })
  @ApiOperation({
    summary: 'Get all staff roles',
    description:
      'The lookup behind every role picker. Assigning someone to an office ' +
      'takes a `roleId`, so the list has to be reachable before the write.',
  })
  async findAllRoles(
    @Query() query: PaginationDto,
    @Req() req: AppRequestWithUser,
  ) {
    const platform = req.data.platform;
    const phone = req.user.phone;

    const log = `[${platform}] ${phone} is getting all roles with query ${JSON.stringify(query)}`;
    this.logger.log(log);

    return await this.utilService.findAllRoles(query);
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
  @ApiOperation({
    summary: 'Get all order statuses',
    description:
      "Doubles as the picker lookup and as the reference screen's table, so " +
      'it takes `q` (free text over `reference` and `orderStatusName`) and ' +
      '`isActive` on top of the usual paging.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: FindAllOrderStatusEntity })
  async findAllOrderStatuses(
    @Query() query: FindOrderStatusDto,
    @Req() req: AppRequestWithUser,
  ) {
    const platform = req.data.platform;
    const phone = req.user.phone;

    const log = `[${platform}] ${phone} is getting all order statuses with query ${JSON.stringify(query)}`;
    this.logger.log(log);

    return await this.utilService.findAllOrderStatuses(query);
  }

  @Get('order-statuses/kpis')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Headline order status counts, over the list filters',
    description:
      'Takes the same query params as GET /reference/order-statuses. ' +
      '`total` respects every filter, `isActive` included. `byStatus` is the ' +
      'exception: it is counted over the same filters minus `isActive`, so ' +
      'the status tab strip keeps every count whichever tab is selected. ' +
      '`totalActive` and `totalInactive` are that breakdown restated as flat ' +
      'figures.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: OrderStatusKpiEntity })
  async getOrderStatusKpis(
    @Query() query: FindOrderStatusDto,
    @Req() req: AppRequestWithUser,
  ) {
    const platform = req.data.platform;
    const phone = req.user.phone;

    const log = `[${platform}] ${phone} is getting order status kpis with query ${JSON.stringify(query)}`;
    this.logger.log(log);

    return await this.utilService.getOrderStatusKpis(query);
  }

  @Post('order-statuses')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Add an order status',
    description:
      'The name is stored upper-case, so "Washing" beside the seeded ' +
      '"WASHING" is a conflict rather than a second row. A status added here ' +
      'is inert until something assigns it: `order.service` only ever moves ' +
      'an order between the names in `OrderStatusEnum`, and the allowed ' +
      'transitions are computed from that enum.',
  })
  @ApiResponse({ status: HttpStatus.CREATED, type: OrderStatusDetailEntity })
  async createOrderStatus(
    @Body() data: CreateOrderStatusDto,
    @Req() req: AppRequestWithUser,
  ) {
    const platform = req.data.platform;
    const phone = req.user.phone;

    const log = `[${platform}] ${phone} is creating an order status with body ${JSON.stringify(data)}`;
    this.logger.log(log);

    return await this.utilService.createOrderStatus(data);
  }

  // Declared after every static route above so `kpis` is never read as an
  // order status reference.
  @Get('order-statuses/:reference')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get one order status by its reference, with its history',
    description:
      'Everything the detail panel shows in one round trip: the row, how ' +
      'many orders currently sit at it, and the audit trail — what changed, ' +
      'by whom and why, with the staff member resolved from `changedBy`. ' +
      'The stored snapshot is never returned.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: OrderStatusDetailEntity })
  async findOrderStatusByReference(
    @Param() params: OrderStatusReferenceParamsDto,
    @Req() req: AppRequestWithUser,
  ) {
    const platform = req.data.platform;
    const phone = req.user.phone;

    const log = `[${platform}] ${phone} is getting order status ${params.reference}`;
    this.logger.log(log);

    return await this.utilService.findOrderStatusByReference(params.reference);
  }

  @Patch('order-statuses/:reference')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reword an order status, or switch it on and off',
    description:
      '`orderStatusName` is deliberately not editable: `order.service` runs ' +
      'the order state machine off that exact string against ' +
      '`OrderStatusEnum`, and `payment.service`, `office.service`, ' +
      '`pickup.service` and `reward.service` look rows up by it too, so a ' +
      'rename would break moving an order with no sign of why. Deactivating ' +
      'only hides the status from the pickers — the services still move ' +
      'orders into it by name. There is no delete: a status live orders are ' +
      'parked on cannot be removed without orphaning them.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: OrderStatusDetailEntity })
  async updateOrderStatus(
    @Param() params: OrderStatusReferenceParamsDto,
    @Body() data: UpdateOrderStatusDto,
    @Req() req: AppRequestWithUser,
  ) {
    const platform = req.data.platform;
    const phone = req.user.phone;

    const log = `[${platform}] ${phone} is updating order status ${params.reference} with body ${JSON.stringify(data)}`;
    this.logger.log(log);

    return await this.utilService.updateOrderStatus(params.reference, data);
  }

  @Get('payment-methods')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: HttpStatus.OK, type: FindAllPaymentMethodEntity })
  @ApiOperation({
    summary: 'Get all payment methods',
    description:
      "Doubles as the picker lookup and as the reference screen's table, so " +
      'it takes `q` (free text over `reference` and `paymentMethodName`) and ' +
      '`isActive` on top of the usual paging.',
  })
  async findAllPaymentMethod(
    @Query() query: FindPaymentMethodDto,
    @Req() req: AppRequestWithUser,
  ) {
    const platform = req.data.platform;
    const phone = req.user.phone;

    const log = `[${platform}] ${phone} is getting all payment methods with query ${JSON.stringify(query)}`;
    this.logger.log(log);

    return await this.utilService.findAllPaymentMethod(query);
  }

  @Get('payment-methods/kpis')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Headline payment method counts, over the list filters',
    description:
      'Takes the same query params as GET /reference/payment-methods. `total` ' +
      'respects every filter, `isActive` included. `byStatus` is the ' +
      'exception: it is counted over the same filters minus `isActive`, so ' +
      'the status tab strip keeps every count whichever tab is selected. ' +
      '`totalActive` and `totalInactive` are that breakdown restated as flat ' +
      'figures.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: PaymentMethodKpiEntity })
  async getPaymentMethodKpis(
    @Query() query: FindPaymentMethodDto,
    @Req() req: AppRequestWithUser,
  ) {
    const platform = req.data.platform;
    const phone = req.user.phone;

    const log = `[${platform}] ${phone} is getting payment method kpis with query ${JSON.stringify(query)}`;
    this.logger.log(log);

    return await this.utilService.getPaymentMethodKpis(query);
  }

  @Post('payment-methods')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Add a payment method',
    description:
      'The name is stored as typed, only trimmed: the seeded methods are ' +
      'spelled `Cash`, `MTN Momo` and `Orange Money`, so upper-casing a new ' +
      'one would leave the list reading two different ways. The clash check ' +
      'is case-insensitive all the same.',
  })
  @ApiResponse({ status: HttpStatus.CREATED, type: PaymentMethodDetailEntity })
  async createPaymentMethod(
    @Body() data: CreatePaymentMethodDto,
    @Req() req: AppRequestWithUser,
  ) {
    const platform = req.data.platform;
    const phone = req.user.phone;

    const log = `[${platform}] ${phone} is creating a payment method with body ${JSON.stringify(data)}`;
    this.logger.log(log);

    return await this.utilService.createPaymentMethod(data);
  }

  // Declared after every static route above so `kpis` is never read as a
  // payment method reference.
  @Get('payment-methods/:reference')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get one payment method by its reference, with its history',
    description:
      'Everything the detail panel shows in one round trip: the row, how ' +
      'many payments were taken by this method, and the audit trail — what changed, by ' +
      'whom and why, with the staff member resolved from `changedBy`. The ' +
      'stored snapshot is never returned.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: PaymentMethodDetailEntity })
  async findPaymentMethodByReference(
    @Param() params: PaymentMethodReferenceParamsDto,
    @Req() req: AppRequestWithUser,
  ) {
    const platform = req.data.platform;
    const phone = req.user.phone;

    const log = `[${platform}] ${phone} is getting payment method ${params.reference}`;
    this.logger.log(log);

    return await this.utilService.findPaymentMethodByReference(
      params.reference,
    );
  }

  @Patch('payment-methods/:reference')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reword a payment method, or switch it on and off',
    description:
      '`paymentMethodName` is deliberately not editable: `payment.service` ' +
      "resolves the payment list's `paymentMethod` filter with an exact " +
      '`findOne` on that string, so a rename would leave the filter matching ' +
      'nothing. There is no delete either: a method live payments were taken ' +
      'by cannot be removed without orphaning them.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: PaymentMethodDetailEntity })
  async updatePaymentMethod(
    @Param() params: PaymentMethodReferenceParamsDto,
    @Body() data: UpdatePaymentMethodDto,
    @Req() req: AppRequestWithUser,
  ) {
    const platform = req.data.platform;
    const phone = req.user.phone;

    const log = `[${platform}] ${phone} is updating payment method ${params.reference} with body ${JSON.stringify(data)}`;
    this.logger.log(log);

    return await this.utilService.updatePaymentMethod(params.reference, data);
  }

  @Get('payment-types')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: HttpStatus.OK, type: FindAllPaymentTypeEntity })
  @ApiOperation({
    summary: 'Get all payment types',
    description:
      "Doubles as the picker lookup and as the reference screen's table, so " +
      'it takes `q` (free text over `reference` and `paymentTypeName`) and ' +
      '`isActive` on top of the usual paging.',
  })
  async findAllPaymentTypes(
    @Query() query: FindPaymentTypeDto,
    @Req() req: AppRequestWithUser,
  ) {
    const platform = req.data.platform;
    const phone = req.user.phone;

    const log = `[${platform}] ${phone} is getting all payment types with query ${JSON.stringify(query)}`;
    this.logger.log(log);

    return await this.utilService.findAllPaymentTypes(query);
  }

  @Get('payment-types/kpis')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Headline payment type counts, over the list filters',
    description:
      'Takes the same query params as GET /reference/payment-types. `total` ' +
      'respects every filter, `isActive` included. `byStatus` is the ' +
      'exception: it is counted over the same filters minus `isActive`, so ' +
      'the status tab strip keeps every count whichever tab is selected. ' +
      '`totalActive` and `totalInactive` are that breakdown restated as flat ' +
      'figures.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: PaymentTypeKpiEntity })
  async getPaymentTypeKpis(
    @Query() query: FindPaymentTypeDto,
    @Req() req: AppRequestWithUser,
  ) {
    const platform = req.data.platform;
    const phone = req.user.phone;

    const log = `[${platform}] ${phone} is getting payment type kpis with query ${JSON.stringify(query)}`;
    this.logger.log(log);

    return await this.utilService.getPaymentTypeKpis(query);
  }

  @Post('payment-types')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Add a payment type',
    description:
      'The name is stored upper-case, so "Refund" beside the seeded ' +
      '"REFUND" is a conflict rather than a second row.',
  })
  @ApiResponse({ status: HttpStatus.CREATED, type: PaymentTypeDetailEntity })
  async createPaymentType(
    @Body() data: CreatePaymentTypeDto,
    @Req() req: AppRequestWithUser,
  ) {
    const platform = req.data.platform;
    const phone = req.user.phone;

    const log = `[${platform}] ${phone} is creating a payment type with body ${JSON.stringify(data)}`;
    this.logger.log(log);

    return await this.utilService.createPaymentType(data);
  }

  // Declared after every static route above so `kpis` is never read as a
  // payment type reference.
  @Get('payment-types/:reference')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get one payment type by its reference, with its history',
    description:
      'Everything the detail panel shows in one round trip: the row, how ' +
      'many payments are filed under this type, and the audit trail — what changed, by ' +
      'whom and why, with the staff member resolved from `changedBy`. The ' +
      'stored snapshot is never returned.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: PaymentTypeDetailEntity })
  async findPaymentTypeByReference(
    @Param() params: PaymentTypeReferenceParamsDto,
    @Req() req: AppRequestWithUser,
  ) {
    const platform = req.data.platform;
    const phone = req.user.phone;

    const log = `[${platform}] ${phone} is getting payment type ${params.reference}`;
    this.logger.log(log);

    return await this.utilService.findPaymentTypeByReference(params.reference);
  }

  @Patch('payment-types/:reference')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reword a payment type, or switch it on and off',
    description:
      '`paymentTypeName` is deliberately not editable: `payment.service` ' +
      'decides whether a payment is a refund by comparing that string ' +
      'against `PaymentTypeEnum.REFUND`, and both it and `office.service` ' +
      'group their takings by it, so a rename would report the money wrong. ' +
      'There is no delete either: a type live payments are filed under ' +
      'cannot be removed without orphaning them.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: PaymentTypeDetailEntity })
  async updatePaymentType(
    @Param() params: PaymentTypeReferenceParamsDto,
    @Body() data: UpdatePaymentTypeDto,
    @Req() req: AppRequestWithUser,
  ) {
    const platform = req.data.platform;
    const phone = req.user.phone;

    const log = `[${platform}] ${phone} is updating payment type ${params.reference} with body ${JSON.stringify(data)}`;
    this.logger.log(log);

    return await this.utilService.updatePaymentType(params.reference, data);
  }
}
