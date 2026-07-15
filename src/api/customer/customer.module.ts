import { Module } from '@nestjs/common';
import { AppUtilService } from 'src/helper/service/app-util.service';
import { CodeGeneratorService } from 'src/helper/service/code-generator.service';
import { CustomerController } from './customer.controller';
import { CustomerService } from './customer.service';
import { RewardService } from '../reward/reward.service';
import { RewardAccrualService } from '../reward/reward-accrual.service';

@Module({
  controllers: [CustomerController],
  providers: [
    CustomerService,
    CodeGeneratorService,
    AppUtilService,
    RewardService,
    RewardAccrualService,
  ],
})
export class CustomerModule {}
