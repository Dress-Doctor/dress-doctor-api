import { Module } from '@nestjs/common';
import { AppUtilService } from 'src/helper/service/app-util.service';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';

@Module({
  exports: [PaymentService],
  providers: [PaymentService, AppUtilService],
  controllers: [PaymentController],
})
export class PaymentModule {}
