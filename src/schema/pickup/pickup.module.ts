import { Global, Module } from '@nestjs/common';
import { getModelToken, MongooseModule } from '@nestjs/mongoose';
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
import {
  PickupStatusHistory,
  PickupStatusHistorySchema,
} from './pickup-status-history.schema';
import { PickupStatus, PickupStatusSchema } from './pickup-status.schema';
import { Model } from 'mongoose';
import { attachHistoryHooks } from 'src/helper/mongoose-history.hook';

@Global()
@Module({
  imports: [
    MongooseModule.forFeatureAsync([
      {
        name: PickupRequest.name,
        inject: [getModelToken(PickupRequestHistory.name)],
        useFactory: (historyModel: Model<PickupRequestHistory>) => {
          const schema = PickupRequestSchema;
          return attachHistoryHooks({
            schema,
            historyModel,
            idField: 'pickupRequestId',
            resourceName: PickupRequest.name,
          });
        },
      },
      {
        name: PickupAssignment.name,
        inject: [getModelToken(PickupAssignmentHistory.name)],
        useFactory: (historyModel: Model<PickupAssignmentHistory>) => {
          const schema = PickupAssignmentSchema;
          return attachHistoryHooks({
            schema,
            historyModel,
            idField: 'pickupAssignmentId',
            resourceName: PickupAssignment.name,
          });
        },
      },

      // Reference data, but editable from the reference screen now, so its
      // edits are recorded like any other domain write.
      {
        name: PickupStatus.name,
        inject: [getModelToken(PickupStatusHistory.name)],
        useFactory: (historyModel: Model<PickupStatusHistory>) =>
          attachHistoryHooks({
            historyModel,
            idField: 'pickupStatusId',
            schema: PickupStatusSchema,
            resourceName: PickupStatus.name,
          }),
      },
    ]),
    MongooseModule.forFeature([
      {
        name: PickupAssignmentHistory.name,
        schema: PickupAssignmentHistorySchema,
      },
      // { name: PickupAssignment.name, schema: PickupAssignmentSchema },
      { name: PickupRequestHistory.name, schema: PickupRequestHistorySchema },
      {
        name: PickupStatusHistory.name,
        schema: PickupStatusHistorySchema,
      },
    ]),
  ],
  exports: [MongooseModule],
})
export class PickupSchemaModule {}
