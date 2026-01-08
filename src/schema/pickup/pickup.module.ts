import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  PickupAssignmentHistory,
  PickupAssignmentHistorySchema,
} from './pickup-assignment-history.schema';
import {
  PickupAssignment,
  PickupAssignmentSchema,
} from './pickup-assignment.schema';
import {
  PickupRequestHistory,
  PickupRequestHistorySchema,
} from './pickup-request-history.schema';
import { PickupRequest, PickupRequestSchema } from './pickup-request.schema';
import { PickupStatus, PickupStatusSchema } from './pickup-status.schema';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: PickupAssignmentHistory.name,
        schema: PickupAssignmentHistorySchema,
      },
      { name: PickupStatus.name, schema: PickupStatusSchema },
      { name: PickupRequest.name, schema: PickupRequestSchema },
      { name: PickupAssignment.name, schema: PickupAssignmentSchema },
      { name: PickupRequestHistory.name, schema: PickupRequestHistorySchema },
    ]),
  ],
  exports: [MongooseModule],
})
export class PickupSchemaModule {}
