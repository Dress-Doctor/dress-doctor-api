import { Module } from '@nestjs/common';
import { AppUtilService } from 'src/helper/service/app-util.service';
import { CodeGeneratorService } from 'src/helper/service/code-generator.service';
import { OfficeController } from './office.controller';
import { OfficeService } from './office.service';

@Module({
  controllers: [OfficeController],
  providers: [OfficeService, CodeGeneratorService, AppUtilService],
})
export class OfficeModule {}
