import { Module } from '@nestjs/common';
import { UtilService } from './util.service';
import { UtilController } from './util.controller';
import { AppUtilService } from 'src/helper/service/app-util.service';
import { CodeGeneratorService } from 'src/helper/service/code-generator.service';

@Module({
  controllers: [UtilController],
  providers: [UtilService, AppUtilService, CodeGeneratorService],
})
export class UtilModule {}
