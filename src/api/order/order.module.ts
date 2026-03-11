import { Module } from '@nestjs/common';
import { AppUtilService } from 'src/helper/service/app-util.service';
import { CodeGeneratorService } from 'src/helper/service/code-generator.service';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';

@Module({
  controllers: [OrderController],
  providers: [OrderService, AppUtilService, CodeGeneratorService],
})
export class OrderModule {}
