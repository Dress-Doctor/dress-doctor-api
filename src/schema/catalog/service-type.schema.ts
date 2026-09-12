import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export const serviceTypeSchemaName = 'service_type';

@Schema({ timestamps: true, collection: serviceTypeSchemaName })
export class ServiceType extends Document<Types.ObjectId> {
  // Human-readable identifier. Every single-row read and write of a service
  // type is addressed by this, never by the mongo id.
  @Prop({ required: true })
  reference: string;

  /**
   * The seed's own name for this row: written once when the seeder creates it,
   * never afterwards. The seeder matches on this rather than on the display
   * name, so renaming the row in the panel cannot make the next seed run
   * insert a second copy of it.
   *
   * Only seeded rows carry one. A row somebody created by hand has none.
   */
  @Prop({ required: false })
  seedKey?: string;

  @Prop({ required: true, unique: true })
  serviceTypeName: string; // Heavy, Basic, Premium

  @Prop({ required: false })
  description?: string;

  @Prop({ required: true, default: true })
  isActive: boolean;
}

export const ServiceTypeSchema = SchemaFactory.createForClass(ServiceType);

ServiceTypeSchema.index({ reference: 1 }, { unique: true });

// Only seeded rows carry a `seedKey`, so the index is sparse: rows created by
// hand have none and must not collide with each other.
ServiceTypeSchema.index({ seedKey: 1 }, { unique: true, sparse: true });
