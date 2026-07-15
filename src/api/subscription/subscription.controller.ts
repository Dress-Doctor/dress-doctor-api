import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiSecurity,
} from '@nestjs/swagger';
import type {
  AppRequestWithUser,
  PaginationDto,
} from 'src/dto/request-data.dto';
import { xApiKey, xApiSecret } from 'src/dto/swagger.dto';
import { SubscribeDto } from './dto/subscribe.dto';
import { UpsertPlanDto } from './dto/upsert-plan.dto';
import { SubscriptionService } from './subscription.service';

@Controller()
@ApiHeader(xApiKey)
@ApiHeader(xApiSecret)
@ApiSecurity('x-api-key')
@ApiSecurity('x-api-secret')
@ApiBearerAuth('access-token')
export class SubscriptionController {
  private readonly logger = new Logger(SubscriptionController.name);
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Get('subscription-plans')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List active subscription plans (seeded data)' })
  async listPlans() {
    return await this.subscriptionService.listPlans();
  }

  @Put('subscription-plans')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create/update a plan (staff)' })
  async upsertPlan(
    @Req() req: AppRequestWithUser,
    @Body() data: UpsertPlanDto,
  ) {
    this.logger.log(
      `[${req.data.platform}] ${req.user.phone} configures plan ${data.planName}`,
    );
    return await this.subscriptionService.upsertPlan(data);
  }

  @Post('subscriptions')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Subscribe a customer to a plan (customers: self only)',
  })
  async subscribe(@Req() req: AppRequestWithUser, @Body() data: SubscribeDto) {
    this.logger.log(
      `[${req.data.platform}] ${req.user.phone} subscribes to plan ${data.planId}`,
    );
    return await this.subscriptionService.subscribe(data);
  }

  @Get('subscriptions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List subscriptions (customers see only theirs)' })
  async findAll(@Query() query: PaginationDto) {
    return await this.subscriptionService.findAll(query);
  }

  @Get('subscriptions/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Subscription detail + remaining quota (scoped)' })
  async findOne(@Param('id') id: string) {
    return await this.subscriptionService.findOne(id);
  }

  @Post('subscriptions/:id/pause')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Pause an active subscription' })
  async pause(@Param('id') id: string) {
    return await this.subscriptionService.pause(id);
  }

  @Post('subscriptions/:id/resume')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resume a paused subscription' })
  async resume(@Param('id') id: string) {
    return await this.subscriptionService.resume(id);
  }

  @Post('subscriptions/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a subscription' })
  async cancel(@Param('id') id: string) {
    return await this.subscriptionService.cancel(id);
  }
}
