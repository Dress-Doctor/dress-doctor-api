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
import { type AppRequestWithUser } from 'src/dto/request-data.dto';
import { xApiKey, xApiSecret, xChangeReason } from 'src/dto/swagger.dto';
import { CatalogueService } from './catalogue.service';
import { CategoryReferenceParamsDto } from './dto/category-params.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateCurrencyDto } from './dto/create-currency.dto';
import { CreateItemDto } from './dto/create-item.dto';
import { CreateServiceTypeDto } from './dto/create-service-type.dto';
import { CreateServiceDto } from './dto/create-service.dto';
import { CreateSubCategoryDto } from './dto/create-sub-category.dto';
import { CurrencyReferenceParamsDto } from './dto/currency-params.dto';
import { FindCategoryDto } from './dto/find-category.dto';
import { FindCurrencyDto } from './dto/find-currency.dto';
import { FindItemDto } from './dto/find-item.dto';
import { FindServiceTypeDto } from './dto/find-service-type.dto';
import { FindServiceDto } from './dto/find-service.dto';
import { FindSubCategoryDto } from './dto/find-sub-category.dto';
import { ItemReferenceParamsDto } from './dto/item-params.dto';
import { ServiceTypeReferenceParamsDto } from './dto/service-type-params.dto';
import { ServiceReferenceParamsDto } from './dto/service-params.dto';
import { SubCategoryReferenceParamsDto } from './dto/sub-category-params.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { UpdateCurrencyDto } from './dto/update-currency.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { UpdateServiceTypeDto } from './dto/update-service-type.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { UpdateSubCategoryDto } from './dto/update-sub-category.dto';
import { CatalogueKpiEntity } from './entities/catalogue.entity';
import {
  CategoryDetailEntity,
  FindAllCategoryEntity,
} from './entities/category.entity';
import {
  CurrencyDetailEntity,
  FindAllCurrencyEntity,
} from './entities/currency.entity';
import { FindAllItemEntity, ItemDetailEntity } from './entities/item.entity';
import {
  FindAllServiceTypeEntity,
  ServiceTypeDetailEntity,
} from './entities/service-type.entity';
import {
  FindAllServiceEntity,
  ServiceDetailEntity,
} from './entities/service.entity';
import {
  FindAllSubCategoryEntity,
  SubCategoryDetailEntity,
} from './entities/sub-category.entity';

/**
 * The catalogue — what the business sells and what it charges for it.
 *
 * Mounted under `/reference` alongside the reference collections, because
 * that is what these six are to every other screen: the lists an order form
 * and a price picker choose from. The catalogue screen is the one place they
 * are written.
 *
 * Every collection reads and writes the same five ways — a filtered page, its
 * KPIs, one row by reference with its trail, an add and an edit — so the
 * blocks below are deliberately alike. The `:reference` routes are declared
 * last within each block, so `kpis` is never read as a reference.
 */
@ApiHeader(xApiKey)
@ApiHeader(xApiSecret)
@ApiHeader(xChangeReason)
@Controller('reference')
@ApiSecurity('x-api-key')
@ApiSecurity('x-api-secret')
@ApiBearerAuth('access-token')
export class CatalogueController {
  private readonly logger = new Logger(CatalogueController.name);

  constructor(private readonly catalogueService: CatalogueService) {}

  /** `[platform] phone`, the prefix every log line here opens with. */
  private who(req: AppRequestWithUser) {
    return `[${req.data.platform}] ${req.user.phone}`;
  }

  /* ---------------------------------------------------------------------- *
   * Items — the priced lines themselves.
   * ---------------------------------------------------------------------- */

  @Get('items')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get all items',
    description:
      "Doubles as the picker lookup and as the catalogue screen's table, " +
      'so it takes `q` (free text over `reference` and `itemName`) and ' +
      '`isActive` on top of the usual paging.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: FindAllItemEntity })
  async findAllItems(
    @Query() query: FindItemDto,
    @Req() req: AppRequestWithUser,
  ) {
    const log = `${this.who(req)} is getting all items with query ${JSON.stringify(query)}`;
    this.logger.log(log);

    return await this.catalogueService.findAllItems(query);
  }

  @Get('items/kpis')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Headline item counts, over the list filters',
    description:
      'Takes the same query params as GET /reference/items. `total` ' +
      'respects every filter, `isActive` included. `byStatus` is the ' +
      'exception: it is counted over the same filters minus `isActive`, so ' +
      'the status tab strip keeps every count whichever tab is selected. ' +
      '`totalActive` and `totalInactive` are that breakdown restated as ' +
      'flat figures.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: CatalogueKpiEntity })
  async getItemKpis(
    @Query() query: FindItemDto,
    @Req() req: AppRequestWithUser,
  ) {
    const log = `${this.who(req)} is getting item kpis with query ${JSON.stringify(query)}`;
    this.logger.log(log);

    return await this.catalogueService.getItemKpis(query);
  }

  @Post('items')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Add an item',
    description:
      "Every link is named by the target's own reference, never by a mongo id: `serviceReference`, `serviceTypeReference`, `currencyReference` and the two optional link lists. `priceHigh` must not be below `priceLow`.",
  })
  @ApiResponse({ status: HttpStatus.CREATED, type: ItemDetailEntity })
  async createItem(
    @Body() data: CreateItemDto,
    @Req() req: AppRequestWithUser,
  ) {
    const log = `${this.who(req)} is creating an item with body ${JSON.stringify(data)}`;
    this.logger.log(log);

    return await this.catalogueService.createItem(data);
  }

  // Declared after every static route above so `kpis` is never read as a
  // item reference.
  @Get('items/:reference')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get one item by its reference, with its history',
    description:
      'Everything the detail panel shows in one round trip: the row, the service, service type, currency, categories and sub categories behind it, how many order lines have been filed against it, and ' +
      'the audit trail — what changed, by whom and why, with the staff ' +
      'member resolved from `changedBy`. The stored snapshot is never ' +
      'returned.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: ItemDetailEntity })
  async findItemByReference(
    @Param() params: ItemReferenceParamsDto,
    @Req() req: AppRequestWithUser,
  ) {
    const log = `${this.who(req)} is getting item ${params.reference}`;
    this.logger.log(log);

    return await this.catalogueService.findItemByReference(params.reference);
  }

  @Patch('items/:reference')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Edit an item, or switch it on and off',
    description:
      "The two link lists REPLACE what the item had rather than adding to it — an absent list leaves the links alone, an empty one clears them. A link change is recorded on the item's own trail, since the link tables carry no history of their own. Deactivating is not a delete: the row stays and everything pointing at it keeps pointing at it, it simply stops being offered by the pickers. There is no delete on purpose — removing a row the catalogue still points at would leave it pointing at nothing.",
  })
  @ApiResponse({ status: HttpStatus.OK, type: ItemDetailEntity })
  async updateItem(
    @Param() params: ItemReferenceParamsDto,
    @Body() data: UpdateItemDto,
    @Req() req: AppRequestWithUser,
  ) {
    const log = `${this.who(req)} is updating item ${params.reference} with body ${JSON.stringify(data)}`;
    this.logger.log(log);

    return await this.catalogueService.updateItem(params.reference, data);
  }

  /* ---------------------------------------------------------------------- *
   * Services — what is done to a garment.
   * ---------------------------------------------------------------------- */

  @Get('services')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get all services',
    description:
      "Doubles as the picker lookup and as the catalogue screen's table, " +
      'so it takes `q` (free text over `reference`, `serviceName` and `description`) and ' +
      '`isActive` on top of the usual paging.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: FindAllServiceEntity })
  async findAllServices(
    @Query() query: FindServiceDto,
    @Req() req: AppRequestWithUser,
  ) {
    const log = `${this.who(req)} is getting all services with query ${JSON.stringify(query)}`;
    this.logger.log(log);

    return await this.catalogueService.findAllServices(query);
  }

  @Get('services/kpis')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Headline service counts, over the list filters',
    description:
      'Takes the same query params as GET /reference/services. `total` ' +
      'respects every filter, `isActive` included. `byStatus` is the ' +
      'exception: it is counted over the same filters minus `isActive`, so ' +
      'the status tab strip keeps every count whichever tab is selected. ' +
      '`totalActive` and `totalInactive` are that breakdown restated as ' +
      'flat figures.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: CatalogueKpiEntity })
  async getServiceKpis(
    @Query() query: FindServiceDto,
    @Req() req: AppRequestWithUser,
  ) {
    const log = `${this.who(req)} is getting service kpis with query ${JSON.stringify(query)}`;
    this.logger.log(log);

    return await this.catalogueService.getServiceKpis(query);
  }

  @Post('services')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Add a service',
    description: 'The name is stored as typed and must be unique.',
  })
  @ApiResponse({ status: HttpStatus.CREATED, type: ServiceDetailEntity })
  async createService(
    @Body() data: CreateServiceDto,
    @Req() req: AppRequestWithUser,
  ) {
    const log = `${this.who(req)} is creating a service with body ${JSON.stringify(data)}`;
    this.logger.log(log);

    return await this.catalogueService.createService(data);
  }

  // Declared after every static route above so `kpis` is never read as a
  // service reference.
  @Get('services/:reference')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get one service by its reference, with its history',
    description:
      'Everything the detail panel shows in one round trip: the row, how many items are priced under it, and ' +
      'the audit trail — what changed, by whom and why, with the staff ' +
      'member resolved from `changedBy`. The stored snapshot is never ' +
      'returned.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: ServiceDetailEntity })
  async findServiceByReference(
    @Param() params: ServiceReferenceParamsDto,
    @Req() req: AppRequestWithUser,
  ) {
    const log = `${this.who(req)} is getting service ${params.reference}`;
    this.logger.log(log);

    return await this.catalogueService.findServiceByReference(params.reference);
  }

  @Patch('services/:reference')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Edit a service, or switch it on and off',
    description:
      'The name IS editable here, unlike the reference collections: nothing in the platform matches a service by its name. Deactivating is not a delete: the row stays and everything pointing at it keeps pointing at it, it simply stops being offered by the pickers. There is no delete on purpose — removing a row the catalogue still points at would leave it pointing at nothing.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: ServiceDetailEntity })
  async updateService(
    @Param() params: ServiceReferenceParamsDto,
    @Body() data: UpdateServiceDto,
    @Req() req: AppRequestWithUser,
  ) {
    const log = `${this.who(req)} is updating service ${params.reference} with body ${JSON.stringify(data)}`;
    this.logger.log(log);

    return await this.catalogueService.updateService(params.reference, data);
  }

  /* ---------------------------------------------------------------------- *
   * Service types — how thoroughly it is done.
   * ---------------------------------------------------------------------- */

  @Get('service-types')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get all service types',
    description:
      "Doubles as the picker lookup and as the catalogue screen's table, " +
      'so it takes `q` (free text over `reference`, `serviceTypeName` and `description`) and ' +
      '`isActive` on top of the usual paging.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: FindAllServiceTypeEntity })
  async findAllServiceTypes(
    @Query() query: FindServiceTypeDto,
    @Req() req: AppRequestWithUser,
  ) {
    const log = `${this.who(req)} is getting all service types with query ${JSON.stringify(query)}`;
    this.logger.log(log);

    return await this.catalogueService.findAllServiceTypes(query);
  }

  @Get('service-types/kpis')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Headline service type counts, over the list filters',
    description:
      'Takes the same query params as GET /reference/service-types. `total` ' +
      'respects every filter, `isActive` included. `byStatus` is the ' +
      'exception: it is counted over the same filters minus `isActive`, so ' +
      'the status tab strip keeps every count whichever tab is selected. ' +
      '`totalActive` and `totalInactive` are that breakdown restated as ' +
      'flat figures.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: CatalogueKpiEntity })
  async getServiceTypeKpis(
    @Query() query: FindServiceTypeDto,
    @Req() req: AppRequestWithUser,
  ) {
    const log = `${this.who(req)} is getting service type kpis with query ${JSON.stringify(query)}`;
    this.logger.log(log);

    return await this.catalogueService.getServiceTypeKpis(query);
  }

  @Post('service-types')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Add a service type',
    description: 'The name is stored as typed and must be unique.',
  })
  @ApiResponse({ status: HttpStatus.CREATED, type: ServiceTypeDetailEntity })
  async createServiceType(
    @Body() data: CreateServiceTypeDto,
    @Req() req: AppRequestWithUser,
  ) {
    const log = `${this.who(req)} is creating a service type with body ${JSON.stringify(data)}`;
    this.logger.log(log);

    return await this.catalogueService.createServiceType(data);
  }

  // Declared after every static route above so `kpis` is never read as a
  // service type reference.
  @Get('service-types/:reference')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get one service type by its reference, with its history',
    description:
      'Everything the detail panel shows in one round trip: the row, how many items are priced under it, and ' +
      'the audit trail — what changed, by whom and why, with the staff ' +
      'member resolved from `changedBy`. The stored snapshot is never ' +
      'returned.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: ServiceTypeDetailEntity })
  async findServiceTypeByReference(
    @Param() params: ServiceTypeReferenceParamsDto,
    @Req() req: AppRequestWithUser,
  ) {
    const log = `${this.who(req)} is getting service type ${params.reference}`;
    this.logger.log(log);

    return await this.catalogueService.findServiceTypeByReference(
      params.reference,
    );
  }

  @Patch('service-types/:reference')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Edit a service type, or switch it on and off',
    description:
      'The name IS editable here: nothing in the platform matches a service type by its name. Deactivating is not a delete: the row stays and everything pointing at it keeps pointing at it, it simply stops being offered by the pickers. There is no delete on purpose — removing a row the catalogue still points at would leave it pointing at nothing.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: ServiceTypeDetailEntity })
  async updateServiceType(
    @Param() params: ServiceTypeReferenceParamsDto,
    @Body() data: UpdateServiceTypeDto,
    @Req() req: AppRequestWithUser,
  ) {
    const log = `${this.who(req)} is updating service type ${params.reference} with body ${JSON.stringify(data)}`;
    this.logger.log(log);

    return await this.catalogueService.updateServiceType(
      params.reference,
      data,
    );
  }

  /* ---------------------------------------------------------------------- *
   * Categories — who the garment is for.
   * ---------------------------------------------------------------------- */

  @Get('categories')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get all categories',
    description:
      "Doubles as the picker lookup and as the catalogue screen's table, " +
      'so it takes `q` (free text over `reference`, `categoryName` and `description`) and ' +
      '`isActive` on top of the usual paging.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: FindAllCategoryEntity })
  async findAllCategories(
    @Query() query: FindCategoryDto,
    @Req() req: AppRequestWithUser,
  ) {
    const log = `${this.who(req)} is getting all categories with query ${JSON.stringify(query)}`;
    this.logger.log(log);

    return await this.catalogueService.findAllCategories(query);
  }

  @Get('categories/kpis')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Headline category counts, over the list filters',
    description:
      'Takes the same query params as GET /reference/categories. `total` ' +
      'respects every filter, `isActive` included. `byStatus` is the ' +
      'exception: it is counted over the same filters minus `isActive`, so ' +
      'the status tab strip keeps every count whichever tab is selected. ' +
      '`totalActive` and `totalInactive` are that breakdown restated as ' +
      'flat figures.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: CatalogueKpiEntity })
  async getCategoryKpis(
    @Query() query: FindCategoryDto,
    @Req() req: AppRequestWithUser,
  ) {
    const log = `${this.who(req)} is getting category kpis with query ${JSON.stringify(query)}`;
    this.logger.log(log);

    return await this.catalogueService.getCategoryKpis(query);
  }

  @Post('categories')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Add a category',
    description: 'The name is stored as typed and must be unique.',
  })
  @ApiResponse({ status: HttpStatus.CREATED, type: CategoryDetailEntity })
  async createCategory(
    @Body() data: CreateCategoryDto,
    @Req() req: AppRequestWithUser,
  ) {
    const log = `${this.who(req)} is creating a category with body ${JSON.stringify(data)}`;
    this.logger.log(log);

    return await this.catalogueService.createCategory(data);
  }

  // Declared after every static route above so `kpis` is never read as a
  // category reference.
  @Get('categories/:reference')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get one category by its reference, with its history',
    description:
      'Everything the detail panel shows in one round trip: the row, how many items sit in it, and ' +
      'the audit trail — what changed, by whom and why, with the staff ' +
      'member resolved from `changedBy`. The stored snapshot is never ' +
      'returned.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: CategoryDetailEntity })
  async findCategoryByReference(
    @Param() params: CategoryReferenceParamsDto,
    @Req() req: AppRequestWithUser,
  ) {
    const log = `${this.who(req)} is getting category ${params.reference}`;
    this.logger.log(log);

    return await this.catalogueService.findCategoryByReference(
      params.reference,
    );
  }

  @Patch('categories/:reference')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Edit a category, or switch it on and off',
    description:
      'The name IS editable here: nothing in the platform matches a category by its name. Deactivating is not a delete: the row stays and everything pointing at it keeps pointing at it, it simply stops being offered by the pickers. There is no delete on purpose — removing a row the catalogue still points at would leave it pointing at nothing.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: CategoryDetailEntity })
  async updateCategory(
    @Param() params: CategoryReferenceParamsDto,
    @Body() data: UpdateCategoryDto,
    @Req() req: AppRequestWithUser,
  ) {
    const log = `${this.who(req)} is updating category ${params.reference} with body ${JSON.stringify(data)}`;
    this.logger.log(log);

    return await this.catalogueService.updateCategory(params.reference, data);
  }

  /* ---------------------------------------------------------------------- *
   * Sub categories — what part of the wardrobe.
   * ---------------------------------------------------------------------- */

  @Get('sub-categories')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get all sub categories',
    description:
      "Doubles as the picker lookup and as the catalogue screen's table, " +
      'so it takes `q` (free text over `reference`, `subCategoryName` and `description`) and ' +
      '`isActive` on top of the usual paging.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: FindAllSubCategoryEntity })
  async findAllSubCategories(
    @Query() query: FindSubCategoryDto,
    @Req() req: AppRequestWithUser,
  ) {
    const log = `${this.who(req)} is getting all sub categories with query ${JSON.stringify(query)}`;
    this.logger.log(log);

    return await this.catalogueService.findAllSubCategories(query);
  }

  @Get('sub-categories/kpis')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Headline sub category counts, over the list filters',
    description:
      'Takes the same query params as GET /reference/sub-categories. `total` ' +
      'respects every filter, `isActive` included. `byStatus` is the ' +
      'exception: it is counted over the same filters minus `isActive`, so ' +
      'the status tab strip keeps every count whichever tab is selected. ' +
      '`totalActive` and `totalInactive` are that breakdown restated as ' +
      'flat figures.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: CatalogueKpiEntity })
  async getSubCategoryKpis(
    @Query() query: FindSubCategoryDto,
    @Req() req: AppRequestWithUser,
  ) {
    const log = `${this.who(req)} is getting sub category kpis with query ${JSON.stringify(query)}`;
    this.logger.log(log);

    return await this.catalogueService.getSubCategoryKpis(query);
  }

  @Post('sub-categories')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Add a sub category',
    description: 'The name is stored as typed and must be unique.',
  })
  @ApiResponse({ status: HttpStatus.CREATED, type: SubCategoryDetailEntity })
  async createSubCategory(
    @Body() data: CreateSubCategoryDto,
    @Req() req: AppRequestWithUser,
  ) {
    const log = `${this.who(req)} is creating a sub category with body ${JSON.stringify(data)}`;
    this.logger.log(log);

    return await this.catalogueService.createSubCategory(data);
  }

  // Declared after every static route above so `kpis` is never read as a
  // sub category reference.
  @Get('sub-categories/:reference')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get one sub category by its reference, with its history',
    description:
      'Everything the detail panel shows in one round trip: the row, how many items sit in it, and ' +
      'the audit trail — what changed, by whom and why, with the staff ' +
      'member resolved from `changedBy`. The stored snapshot is never ' +
      'returned.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: SubCategoryDetailEntity })
  async findSubCategoryByReference(
    @Param() params: SubCategoryReferenceParamsDto,
    @Req() req: AppRequestWithUser,
  ) {
    const log = `${this.who(req)} is getting sub category ${params.reference}`;
    this.logger.log(log);

    return await this.catalogueService.findSubCategoryByReference(
      params.reference,
    );
  }

  @Patch('sub-categories/:reference')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Edit a sub category, or switch it on and off',
    description:
      'The name IS editable here: nothing in the platform matches a sub category by its name. Deactivating is not a delete: the row stays and everything pointing at it keeps pointing at it, it simply stops being offered by the pickers. There is no delete on purpose — removing a row the catalogue still points at would leave it pointing at nothing.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: SubCategoryDetailEntity })
  async updateSubCategory(
    @Param() params: SubCategoryReferenceParamsDto,
    @Body() data: UpdateSubCategoryDto,
    @Req() req: AppRequestWithUser,
  ) {
    const log = `${this.who(req)} is updating sub category ${params.reference} with body ${JSON.stringify(data)}`;
    this.logger.log(log);

    return await this.catalogueService.updateSubCategory(
      params.reference,
      data,
    );
  }

  /* ---------------------------------------------------------------------- *
   * Currencies — what the prices are in.
   * ---------------------------------------------------------------------- */

  @Get('currencies')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get all currencies',
    description:
      "Doubles as the picker lookup and as the catalogue screen's table, " +
      'so it takes `q` (free text over `reference`, `isoCode`, `name`, `countryName` and `symbol`) and ' +
      '`isActive` on top of the usual paging.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: FindAllCurrencyEntity })
  async findAllCurrencies(
    @Query() query: FindCurrencyDto,
    @Req() req: AppRequestWithUser,
  ) {
    const log = `${this.who(req)} is getting all currencies with query ${JSON.stringify(query)}`;
    this.logger.log(log);

    return await this.catalogueService.findAllCurrencies(query);
  }

  @Get('currencies/kpis')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Headline currency counts, over the list filters',
    description:
      'Takes the same query params as GET /reference/currencies. `total` ' +
      'respects every filter, `isActive` included. `byStatus` is the ' +
      'exception: it is counted over the same filters minus `isActive`, so ' +
      'the status tab strip keeps every count whichever tab is selected. ' +
      '`totalActive` and `totalInactive` are that breakdown restated as ' +
      'flat figures.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: CatalogueKpiEntity })
  async getCurrencyKpis(
    @Query() query: FindCurrencyDto,
    @Req() req: AppRequestWithUser,
  ) {
    const log = `${this.who(req)} is getting currency kpis with query ${JSON.stringify(query)}`;
    this.logger.log(log);

    return await this.catalogueService.getCurrencyKpis(query);
  }

  @Post('currencies')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Add a currency',
    description:
      '`isoCode` is stored upper-case and must be a three-letter ISO 4217 code. Both it and `countryName` are unique.',
  })
  @ApiResponse({ status: HttpStatus.CREATED, type: CurrencyDetailEntity })
  async createCurrency(
    @Body() data: CreateCurrencyDto,
    @Req() req: AppRequestWithUser,
  ) {
    const log = `${this.who(req)} is creating a currency with body ${JSON.stringify(data)}`;
    this.logger.log(log);

    return await this.catalogueService.createCurrency(data);
  }

  // Declared after every static route above so `kpis` is never read as a
  // currency reference.
  @Get('currencies/:reference')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get one currency by its reference, with its history',
    description:
      'Everything the detail panel shows in one round trip: the row, how many items are priced in it, how many payments have been taken in it, and ' +
      'the audit trail — what changed, by whom and why, with the staff ' +
      'member resolved from `changedBy`. The stored snapshot is never ' +
      'returned.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: CurrencyDetailEntity })
  async findCurrencyByReference(
    @Param() params: CurrencyReferenceParamsDto,
    @Req() req: AppRequestWithUser,
  ) {
    const log = `${this.who(req)} is getting currency ${params.reference}`;
    this.logger.log(log);

    return await this.catalogueService.findCurrencyByReference(
      params.reference,
    );
  }

  @Patch('currencies/:reference')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Edit a currency, or switch it on and off',
    description:
      "`isoCode` is deliberately not editable: `payment.service` looks the house currency up with `findOne({ isoCode: 'XAF' })`, so a rename would leave that finding nothing. The display name, the country and the symbol are editable instead. Deactivating is not a delete: the row stays and everything pointing at it keeps pointing at it, it simply stops being offered by the pickers. There is no delete on purpose — removing a row the catalogue still points at would leave it pointing at nothing.",
  })
  @ApiResponse({ status: HttpStatus.OK, type: CurrencyDetailEntity })
  async updateCurrency(
    @Param() params: CurrencyReferenceParamsDto,
    @Body() data: UpdateCurrencyDto,
    @Req() req: AppRequestWithUser,
  ) {
    const log = `${this.who(req)} is updating currency ${params.reference} with body ${JSON.stringify(data)}`;
    this.logger.log(log);

    return await this.catalogueService.updateCurrency(params.reference, data);
  }
}
