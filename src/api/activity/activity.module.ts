import { Module } from '@nestjs/common';
import { AppUtilService } from 'src/helper/service/app-util.service';
import { ActivityController } from './activity.controller';
import { ActivityReadService } from './activity.service';

@Module({
  controllers: [ActivityController],
  providers: [ActivityReadService, AppUtilService],
})
export class ActivityModule {}
