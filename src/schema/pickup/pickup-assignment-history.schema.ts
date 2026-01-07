import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { ActionEnum } from '../dto/permission-schema.dto';
import { ChangedFieldDto } from '../dto/user-schema.dto';
import { User } from '../user/user.schema';
import { PickupAssignment } from './pickup-assignment.schema';

export const pickupAssignmentHistorySchemaName = 'pickup_assignment_history';
@Schema({ timestamps: true, collection: pickupAssignmentHistorySchemaName })
export class PickupAssignmentHistory extends Document<Types.ObjectId> {
  @Prop({
    index: true,
    required: true,
    type: Types.ObjectId,
    ref: PickupAssignment.name,
  })
  pickupAssignmentId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: User.name })
  changedBy: Types.ObjectId;

  @Prop({
    required: false,
    type: [
      {
        field: String,
        to: MongooseSchema.Types.Mixed,
        from: MongooseSchema.Types.Mixed,
      },
    ],
    default: [],
  })
  changedFields?: ChangedFieldDto[];

  @Prop({ required: true, enum: ActionEnum })
  action: ActionEnum;

  @Prop({ required: false, type: Object, default: {} })
  snapshot?: Record<string, any>;
}

export const PickupAssignmentHistorySchema = SchemaFactory.createForClass(
  PickupAssignmentHistory,
);
