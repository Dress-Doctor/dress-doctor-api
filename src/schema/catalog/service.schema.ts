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
  serviceName: string; // Wash and Fold,  Wash and Iron,  Cleaning

  @Prop({ required: false })
  description?: string;

  @Prop({ required: true, default: true })
  isActive: boolean;
}

export const ServiceSchema = SchemaFactory.createForClass(Service);

ServiceSchema.index({ reference: 1 }, { unique: true });

// Only seeded rows carry a `seedKey`, so the index is sparse: rows created by
// hand have none and must not collide with each other.
ServiceSchema.index({ seedKey: 1 }, { unique: true, sparse: true });
