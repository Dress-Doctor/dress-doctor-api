import { Module } from '@nestjs/common';
import { PickupService } from './pickup.service';
import { PickupController } from './pickup.controller';
import { CodeGeneratorService } from 'src/helper/service/code-generator.service';

@Module({
  controllers: [PickupController],
  providers: [PickupService, CodeGeneratorService],
})
export class PickupModule {}
