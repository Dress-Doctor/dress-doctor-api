import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { HistoryActionEnum } from '../admin/admin.dto';
import { ChangedFieldDto } from '../user/user.dto';
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

  @Prop({ required: false, type: Object, default: {} })
  changedFields?: Record<string, ChangedFieldDto>;

  @Prop({ required: true, type: String, enum: HistoryActionEnum })
  action: HistoryActionEnum;

  @Prop({ required: false, type: Object, default: {} })
  snapshot?: Record<string, any>;
}

export const PickupAssignmentHistorySchema = SchemaFactory.createForClass(
  PickupAssignmentHistory,
);
