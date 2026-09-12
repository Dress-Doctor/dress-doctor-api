import { Global, Module } from '@nestjs/common';
import { ActivityService } from '../service/activity.service';

// Global so the API and the worker both resolve one ActivityService: it
// registers itself as the recorder the audit hook calls, and the hook runs
// wherever the write does.
@Global()
@Module({
  providers: [ActivityService],
  exports: [ActivityService],
})
export class ActivityRecorderModule {}
