import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
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
import type { AppRequestWithUser } from 'src/dto/request-data.dto';
import {
  ApiSuccessResponse,
  ApiSuccessResponseWithPagination,
  xApiKey,
  xApiSecret,
} from 'src/dto/swagger.dto';
import { CustomerService } from './customer.service';
import { FindCustomerDto } from './dto/find-customer.dto';
import { RegisterCustomerDto } from './dto/register-customer.dto';

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
}
