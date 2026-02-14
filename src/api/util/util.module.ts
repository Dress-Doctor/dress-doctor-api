import { Module } from '@nestjs/common';
import { UtilService } from './util.service';
import { UtilController } from './util.controller';
import { AppUtilService } from 'src/helper/service/app-util.service';

@Module({
  controllers: [UtilController],
  providers: [UtilService, AppUtilService],
})
export class UtilModule {}
