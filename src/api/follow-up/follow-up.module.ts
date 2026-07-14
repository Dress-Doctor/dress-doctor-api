import { Module } from '@nestjs/common';
import { AppUtilService } from 'src/helper/service/app-util.service';
import { FollowUpController } from './follow-up.controller';
import { FollowUpService } from './follow-up.service';

@Module({
  controllers: [FollowUpController],
  providers: [FollowUpService, AppUtilService],
})
export class FollowUpModule {}
