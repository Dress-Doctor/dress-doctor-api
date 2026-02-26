import { Module } from '@nestjs/common';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';
import { CodeGeneratorService } from 'src/helper/service/code-generator.service';

@Module({
  controllers: [OrderController],
  providers: [OrderService, CodeGeneratorService],
})
export class OrderModule {}
