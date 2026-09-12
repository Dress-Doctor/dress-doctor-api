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
import type { Response } from 'express';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiProduces,
  ApiResponse,
  ApiSecurity,
} from '@nestjs/swagger';
import type { AppRequestWithUser } from 'src/dto/request-data.dto';
// A value import, not a type-only one: `ValidationPipe` reads the DTO class off
// the emitted parameter metadata, and a type-only import erases it — the query
// then validates against `Object` and every param is rejected as unexpected.
import { PaginationDto } from 'src/dto/request-data.dto';
import {
  ApiSuccessResponse,
  ApiSuccessResponseWithPagination,
  xApiKey,
  xApiSecret,
  xChangeReason,
} from 'src/dto/swagger.dto';
import { CustomerService } from './customer.service';
import { CustomerKpiEntity } from './entities/customer-kpi.entity';
import { CustomerCodeParamsDto } from './dto/customer-code-params.dto';
import {
  SpendTrendQueryDto,
  TimelineQueryDto,
} from './dto/customer-detail-query.dto';
import { CustomerDetailResponseEntity } from './entities/customer-detail.entity';
import { CustomerSummaryResponseEntity } from './entities/customer-summary.entity';
import { SpendTrendResponseEntity } from './entities/customer-spend-trend.entity';
import { CustomerTimelineResponseEntity } from './entities/customer-timeline.entity';
import { ExportCustomerDto } from './dto/export-customer.dto';
import { FindCustomerDto } from './dto/find-customer.dto';
import { RegisterCustomerDto } from './dto/register-customer.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Controller('customers')
@ApiHeader(xApiKey)
@ApiHeader(xApiSecret)
@ApiHeader(xChangeReason)
@ApiSecurity('x-api-key')
@ApiSecurity('x-api-secret')
@ApiBearerAuth('access-token')
export class CustomerController {
  private readonly logger = new Logger(CustomerController.name);
  constructor(private readonly customerService: CustomerService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Register a customer (User + 1:1 Customer profile)',
  })
  @ApiResponse({ status: HttpStatus.CREATED, type: ApiSuccessResponse })
  async register(
    @Body() data: RegisterCustomerDto,
    @Req() req: AppRequestWithUser,
  ) {
    // Do not log `data` — it carries customer PII.
    this.logger.log(
      `[${req.data.platform}] ${req.user.phone} registers a customer`,
    );
    return await this.customerService.register(data);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'List customers (filter q, officeCode, startDate, endDate, isActive, ' +
      'language, inactiveDays)',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    type: ApiSuccessResponseWithPagination,
  })
  async findAll(@Query() query: FindCustomerDto) {
    return await this.customerService.findAll(query);
  }

  @Get('inactive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Customers inactive 14+ days (threshold override via inactiveDays)',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    type: ApiSuccessResponseWithPagination,
  })
  async findInactive(@Query() query: FindCustomerDto) {
    return await this.customerService.findInactive(query);
  }

  @Get('export')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Export filtered customers as a CSV or Excel download',
  })
  @ApiProduces(
    'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  async exportCustomers(
    @Query() query: ExportCustomerDto,
    @Req() req: AppRequestWithUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { platform } = req.data;
    this.logger.log(
      `[${platform}] ${req.user.phone} is exporting customers as ${query.format}`,
    );
    const { buffer, filename, contentType } =
      await this.customerService.exportCustomers(query);
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
    summary:
      'Headline customer counts for the dashboard, over the list filters',
    description:
      'Takes the same query params as GET /customers, but the date range ' +
      'plays a different role: it dates `newCustomers` and `activeCustomers` ' +
      'rather than narrowing the base, so `totalCustomers` and `byStatus` ' +
      'still answer "of everyone matching the filters". `atRiskCustomers` ' +
      'hangs off the end date alone — the 14 days ending on it. With no dates ' +
      'given the whole window defaults to the 14 days ending today. The ' +
      '`byStatus` breakdown is the other exception: it is returned across ' +
      'both statuses, over the same filters minus `isActive`, so a tab strip ' +
      'keeps its counts whichever tab is selected.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: CustomerKpiEntity })
  async getCustomerKpis(
    @Query() query: FindCustomerDto,
    @Req() req: AppRequestWithUser,
  ) {
    const { platform } = req.data;
    this.logger.log(
      `[${platform}] ${req.user.phone} is fetching customer kpis with query ${JSON.stringify(query)}`,
    );
    return await this.customerService.getCustomerKpis(query);
  }

  // Declared after every static GET above so `inactive`, `export` and `kpis`
  // are never read as a customer code.
  @Get(':customerCode')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'One customer by their code — profile, rollups, tier, referral',
    description:
      'Addressed by the human-readable `customerCode` (CU-A4F92C), never by ' +
      'the Mongo id. Identity, reporting office, cached loyalty tier and the ' +
      'referral they came in on are resolved in place, so a detail screen ' +
      'reads the same shape the list gives. Office/self scoped: a customer ' +
      'outside the caller\u2019s scope returns 404, never 403.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: CustomerDetailResponseEntity })
  async findOne(
    @Param() { customerCode }: CustomerCodeParamsDto,
    @Req() req: AppRequestWithUser,
  ) {
    this.logger.log(
      `[${req.data.platform}] ${req.user.phone} is fetching customer ${customerCode}`,
    );
    return await this.customerService.findByCode(customerCode);
  }

  @Get(':customerCode/summary')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Headline figures for one customer',
    description:
      'Everything the top of the detail page shows in one round trip: order ' +
      'and pickup counts, money ordered / paid / outstanding, how they pay ' +
      'broken down by method, and when they were last seen. Payments are ' +
      'reached through the customer\u2019s own orders, so nothing recorded ' +
      'against an order can be missed or double-counted.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: CustomerSummaryResponseEntity })
  async getSummary(@Param() { customerCode }: CustomerCodeParamsDto) {
    return await this.customerService.getSummary(customerCode);
  }

  @Get(':customerCode/spend-trend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Ordered against paid, month by month',
    description:
      'Ordered is dated by `receivedAt` and paid by `paidAt`, so a gap ' +
      'between the two bars is a debt rather than a reporting lag. Every ' +
      'month in the window is present, even an empty one.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: SpendTrendResponseEntity })
  async getSpendTrend(
    @Param() { customerCode }: CustomerCodeParamsDto,
    @Query() { months }: SpendTrendQueryDto,
  ) {
    return await this.customerService.getSpendTrend(customerCode, months);
  }

  @Get(':customerCode/orders')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Order history + live status (paginated)',
    description:
      'Each row carries its live status, the pickup it came off (if any) and ' +
      'its garment count. The full order lives at GET /orders/:orderCode.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    type: ApiSuccessResponseWithPagination,
  })
  async findOrders(
    @Param() { customerCode }: CustomerCodeParamsDto,
    @Query() query: PaginationDto,
  ) {
    return await this.customerService.findOrders(customerCode, query);
  }

  @Get(':customerCode/pickups')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Pickup history (paginated)',
    description:
      'A pickup can carry several orders and an order can exist without a ' +
      'pickup, so this count is read beside the order count, never against ' +
      'it. Each row carries its status, its agent and the orders raised off ' +
      'it; the full pickup lives at GET /pickups/:reference.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    type: ApiSuccessResponseWithPagination,
  })
  async findPickups(
    @Param() { customerCode }: CustomerCodeParamsDto,
    @Query() query: PaginationDto,
  ) {
    return await this.customerService.findPickups(customerCode, query);
  }

  @Get(':customerCode/payments')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Payment history (paginated)',
    description:
      'Every receipt taken against the customer\u2019s orders, newest first, ' +
      'with its method, the order it settled and who took it.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    type: ApiSuccessResponseWithPagination,
  })
  async findPayments(
    @Param() { customerCode }: CustomerCodeParamsDto,
    @Query() query: PaginationDto,
  ) {
    return await this.customerService.findPayments(customerCode, query);
  }

  @Get(':customerCode/history')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Audit trail of profile changes (paginated)',
    description:
      'A customer is two records \u2014 the profile (address, opt-in, ' +
      'rollups) and the identity (name, phone, email, language) \u2014 and a ' +
      'reader does not care which one moved, so both trails are merged and ' +
      'each entry says where it came from. Carries only what changed ' +
      '(field, from, to), who changed it and why, with foreign keys labelled. ' +
      'The stored snapshot never leaves the server.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    type: ApiSuccessResponseWithPagination,
  })
  async findHistory(
    @Param() { customerCode }: CustomerCodeParamsDto,
    @Query() query: PaginationDto,
  ) {
    return await this.customerService.findHistory(customerCode, query);
  }

  @Get(':customerCode/timeline')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Merged activity feed, newest first',
    description:
      'Orders raised and delivered, payments taken, pickups requested and ' +
      'profile edits in one list. Facts only \u2014 each kind is worded by ' +
      'the frontend in the reader\u2019s language.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: CustomerTimelineResponseEntity })
  async findTimeline(
    @Param() { customerCode }: CustomerCodeParamsDto,
    @Query() { limit }: TimelineQueryDto,
  ) {
    return await this.customerService.findTimeline(customerCode, limit);
  }

  @Get(':customerCode/rewards')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Points balance, tier, progress to the next tier + recent ledger',
  })
  @ApiResponse({ status: HttpStatus.OK, type: ApiSuccessResponse })
  async findRewards(@Param() { customerCode }: CustomerCodeParamsDto) {
    return await this.customerService.findRewards(customerCode);
  }

  @Get(':customerCode/referral')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Own code and link, who brought them in, and who they brought in',
  })
  @ApiResponse({ status: HttpStatus.OK, type: ApiSuccessResponse })
  async findReferral(@Param() { customerCode }: CustomerCodeParamsDto) {
    return await this.customerService.findReferral(customerCode);
  }

  @Get(':customerCode/balance')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Outstanding balance + the orders carrying it',
  })
  @ApiResponse({ status: HttpStatus.OK, type: ApiSuccessResponse })
  async findBalance(@Param() { customerCode }: CustomerCodeParamsDto) {
    return await this.customerService.findBalance(customerCode);
  }

  @Get(':customerCode/subscription')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Live subscription view + plan' })
  @ApiResponse({ status: HttpStatus.OK, type: ApiSuccessResponse })
  async findSubscription(@Param() { customerCode }: CustomerCodeParamsDto) {
    return await this.customerService.findSubscription(customerCode);
  }

  @Patch(':customerCode')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Profile edit (contact, language, pickup address, opt-in)',
  })
  @ApiResponse({ status: HttpStatus.OK, type: ApiSuccessResponse })
  async updateProfile(
    @Param() { customerCode }: CustomerCodeParamsDto,
    @Body() data: UpdateProfileDto,
  ) {
    return await this.customerService.updateProfile(customerCode, data);
  }
}
