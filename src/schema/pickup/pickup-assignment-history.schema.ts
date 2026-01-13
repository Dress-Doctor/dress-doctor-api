import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { ChangedFieldDto } from '../user/user.dto';
import { User } from '../user/user.schema';
import { PickupAssignment } from './pickup-assignment.schema';
import { HistoryActionEnum } from '../admin/admin.dto';

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

  @Prop({ required: true, enum: HistoryActionEnum })
  action: HistoryActionEnum;

  @Prop({ required: false, type: Object, default: {} })
  snapshot?: Record<string, any>;
}

export const PickupAssignmentHistorySchema = SchemaFactory.createForClass(
  PickupAssignmentHistory,
);
