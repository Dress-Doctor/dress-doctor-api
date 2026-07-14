import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
} from '@nestjs/swagger';
import {
  ApiSuccessResponse,
  ApiSuccessResponseWithPagination,
  xApiKey,
  xApiSecret,
} from 'src/dto/swagger.dto';
import { CreatePriceDto } from './dto/create-price.dto';
import { FindPriceDto } from './dto/find-price.dto';
import { QuoteDto } from './dto/quote.dto';
import { PricingService } from './pricing.service';

@Controller('pricing')
@ApiHeader(xApiKey)
@ApiHeader(xApiSecret)
@ApiSecurity('x-api-key')
@ApiSecurity('x-api-secret')
@ApiBearerAuth('access-token')
export class PricingController {
  constructor(private readonly pricingService: PricingService) {}

  @Post('quote')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Price a basket without creating an order' })
  @ApiResponse({ status: HttpStatus.OK, type: ApiSuccessResponse })
  async quote(@Body() data: QuoteDto) {
    return await this.pricingService.quote(data);
  }

  @Post('prices')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a price (per-office or company-wide)' })
  @ApiResponse({ status: HttpStatus.CREATED, type: ApiSuccessResponse })
  async createPrice(@Body() data: CreatePriceDto) {
    return await this.pricingService.createPrice(data);
  }

  @Get('prices')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List prices (filter item/serviceType/office)' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: ApiSuccessResponseWithPagination,
  })
  async listPrices(@Query() query: FindPriceDto) {
    return await this.pricingService.listPrices(query);
  }
}
