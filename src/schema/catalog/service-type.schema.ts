import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true, collection: 'service_type' })
export class ServiceType extends Document<Types.ObjectId> {
  @Prop({ required: true, unique: true })
  serviceTypeName: string; // Heavy, Basic, Premium

  @Prop({ required: false })
  description?: string;

  @Prop({ required: true, default: true })
  isActive: boolean;
}

export const ServiceTypeSchema = SchemaFactory.createForClass(ServiceType);
