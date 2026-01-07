import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { User } from '../user/user.schema';
import { PickupRequest } from './pickup-request.schema';

export const pickupAssignmentSchemaName = 'pickup_assignment';
@Schema({ timestamps: true, collection: pickupAssignmentSchemaName })
export class PickupAssignment extends Document<Types.ObjectId> {
  @Prop({ required: true, type: Types.ObjectId, ref: User.name })
  agentId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: PickupRequest.name })
  pickupRequestId: Types.ObjectId;

  @Prop({ required: true })
  assignedAt: Date;
}

export const PickupAssignmentSchema =
  SchemaFactory.createForClass(PickupAssignment);
