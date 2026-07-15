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
import type {
  AppRequestWithUser,
  PaginationDto,
} from 'src/dto/request-data.dto';
import {
  ApiSuccessResponse,
  ApiSuccessResponseWithPagination,
  xApiKey,
  xApiSecret,
} from 'src/dto/swagger.dto';
import { CustomerService } from './customer.service';
import { FindCustomerDto } from './dto/find-customer.dto';
import { RegisterCustomerDto } from './dto/register-customer.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Controller('customers')
@ApiHeader(xApiKey)
@ApiHeader(xApiSecret)
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
    summary: 'List customers (filter q, homeOfficeId, inactiveDays)',
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

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Customer profile + rollups' })
  @ApiResponse({ status: HttpStatus.OK, type: ApiSuccessResponse })
  async findOne(@Param('id') id: string) {
    return await this.customerService.findOne(id);
  }

  // -------- customer self-service sub-resources (§2.3, all self-scoped) ----

  @Get(':id/orders')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Order history + live status (self-scoped)' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: ApiSuccessResponseWithPagination,
  })
  async findOrders(@Param('id') id: string, @Query() query: PaginationDto) {
    return await this.customerService.findOrders(id, query);
  }

  @Get(':id/rewards')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Points balance, tier, progress + recent ledger (self-scoped)',
  })
  @ApiResponse({ status: HttpStatus.OK, type: ApiSuccessResponse })
  async findRewards(@Param('id') id: string) {
    return await this.customerService.findRewards(id);
  }

  @Get(':id/referral')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Own referral code, shareable link + brought-in count',
  })
  @ApiResponse({ status: HttpStatus.OK, type: ApiSuccessResponse })
  async findReferral(@Param('id') id: string) {
    return await this.customerService.findReferral(id);
  }

  @Get(':id/balance')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Outstanding balance + the orders carrying it (self-scoped)',
  })
  @ApiResponse({ status: HttpStatus.OK, type: ApiSuccessResponse })
  async findBalance(@Param('id') id: string) {
    return await this.customerService.findBalance(id);
  }

  @Get(':id/subscription')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Live subscription view + plan (self-scoped)' })
  @ApiResponse({ status: HttpStatus.OK, type: ApiSuccessResponse })
  async findSubscription(@Param('id') id: string) {
    return await this.customerService.findSubscription(id);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Self-service profile edit (contact, language, opt-in)',
  })
  @ApiResponse({ status: HttpStatus.OK, type: ApiSuccessResponse })
  async updateProfile(@Param('id') id: string, @Body() data: UpdateProfileDto) {
    return await this.customerService.updateProfile(id, data);
  }
}
