import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
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
import { RedeemDto } from './dto/redeem.dto';
import { UpsertRuleDto } from './dto/upsert-rule.dto';
import { UpsertTierDto } from './dto/upsert-tier.dto';
import { RewardService } from './reward.service';

@Controller('rewards')
@ApiHeader(xApiKey)
@ApiHeader(xApiSecret)
@ApiSecurity('x-api-key')
@ApiSecurity('x-api-secret')
@ApiBearerAuth('access-token')
export class RewardController {
  private readonly logger = new Logger(RewardController.name);
  constructor(private readonly rewardService: RewardService) {}

  @Get('rules')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List reward rules (accrual/milestone config)' })
  async listRules() {
    return await this.rewardService.listRules();
  }

  @Put('rules')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Configure a reward rule (staff)' })
  async upsertRule(
    @Req() req: AppRequestWithUser,
    @Body() data: UpsertRuleDto,
  ) {
    this.logger.log(
      `[${req.data.platform}] ${req.user.phone} configures reward rule ${data.type}`,
    );
    return await this.rewardService.upsertRule(data);
  }

  @Get('tiers')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List loyalty tiers' })
  async listTiers() {
    return await this.rewardService.listTiers();
  }

  @Put('tiers')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Configure a loyalty tier (staff)' })
  async upsertTier(
    @Req() req: AppRequestWithUser,
    @Body() data: UpsertTierDto,
  ) {
    this.logger.log(
      `[${req.data.platform}] ${req.user.phone} configures tier ${data.tierName}`,
    );
    return await this.rewardService.upsertTier(data);
  }

  @Get('ledger')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Points ledger (customers see only their own entries)',
  })
  async listLedger(@Query() query: PaginationDto) {
    return await this.rewardService.listLedger(query);
  }

  @Post('redeem')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Redeem points as a discount on a draft order (transactional)',
  })
  async redeem(@Req() req: AppRequestWithUser, @Body() data: RedeemDto) {
    this.logger.log(
      `[${req.data.platform}] ${req.user.phone} redeems ${data.points} points on order ${data.orderId}`,
    );
    return await this.rewardService.redeem(data);
  }
}
