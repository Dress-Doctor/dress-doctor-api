import { Module } from '@nestjs/common';
import { AppUtilService } from 'src/helper/service/app-util.service';
import { RewardAccrualService } from './reward-accrual.service';
import { RewardController } from './reward.controller';
import { RewardService } from './reward.service';

@Module({
  controllers: [RewardController],
  providers: [RewardService, RewardAccrualService, AppUtilService],
  exports: [RewardAccrualService],
})
export class RewardModule {}
