import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, Document } from 'mongoose';

export const pickupStatusSchemaName = 'pickup_status';
@Schema({ timestamps: true, collection: pickupStatusSchemaName })
export class PickupStatus extends Document<Types.ObjectId> {
  @Prop({ required: true, unique: true })
  pickupStatusName: string;

  @Prop({ required: false })
  description?: string;

  @Prop({ required: true, default: true })
  isActive: boolean;
}

export const PickupStatusSchema = SchemaFactory.createForClass(PickupStatus);
