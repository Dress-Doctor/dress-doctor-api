import { Module } from '@nestjs/common';
import { AppUtilService } from 'src/helper/service/app-util.service';
import { CodeGeneratorService } from 'src/helper/service/code-generator.service';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';
// import { PaymentModule } from '../payment/payment.module';
import { PaymentService } from '../payment/payment.service';

@Module({
  // imports: [PaymentModule],
  controllers: [OrderController],
  providers: [
    OrderService,
    AppUtilService,
    PaymentService,
    CodeGeneratorService,
  ],
})
export class OrderModule {}
