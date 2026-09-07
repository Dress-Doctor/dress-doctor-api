import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export const serviceTypeSchemaName = 'service_type';

@Schema({ timestamps: true, collection: serviceTypeSchemaName })
export class ServiceType extends Document<Types.ObjectId> {
  // Human-readable identifier. Every single-row read and write of a service
  // type is addressed by this, never by the mongo id.
  @Prop({ required: true })
  reference: string;

  @Prop({ required: true, unique: true })
  serviceTypeName: string; // Heavy, Basic, Premium

  @Prop({ required: false })
  description?: string;

  @Prop({ required: true, default: true })
  isActive: boolean;
}

export const ServiceTypeSchema = SchemaFactory.createForClass(ServiceType);

// Sparse, so the unique index can be built over rows written before
// `reference` existed. `npm run backfill:service-type-reference` fills them in.
ServiceTypeSchema.index({ reference: 1 }, { unique: true, sparse: true });
