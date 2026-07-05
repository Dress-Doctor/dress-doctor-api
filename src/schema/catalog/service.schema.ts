import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true, collection: 'service' })
export class Service extends Document<Types.ObjectId> {
  @Prop({ required: true, unique: true })
  serviceName: string; // Wash and Fold,  Wash and Iron,  Cleaning

  @Prop({ required: false })
  description?: string;

  @Prop({ required: true, default: true })
  isActive: boolean;
}

export const ServiceSchema = SchemaFactory.createForClass(Service);
