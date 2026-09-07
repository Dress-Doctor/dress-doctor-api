import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export const serviceSchemaName = 'service';

@Schema({ timestamps: true, collection: serviceSchemaName })
export class Service extends Document<Types.ObjectId> {
  // Human-readable identifier, the same idea as a payment's `reference` or an
  // order's `orderCode`: it is what a URL, a table row and a support
  // conversation quote, so nobody has to pass a 24-character mongo id around.
  @Prop({ required: true })
  reference: string;

  @Prop({ required: true, unique: true })
  serviceName: string; // Wash and Fold,  Wash and Iron,  Cleaning

  @Prop({ required: false })
  description?: string;

  @Prop({ required: true, default: true })
  isActive: boolean;
}

export const ServiceSchema = SchemaFactory.createForClass(Service);

// Sparse, so the unique index can be built over rows written before
// `reference` existed. `npm run backfill:service-reference` fills those in.
ServiceSchema.index({ reference: 1 }, { unique: true, sparse: true });
