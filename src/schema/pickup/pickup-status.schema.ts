import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, Document } from 'mongoose';

export const pickupStatusSchemaName = 'pickup_status';
@Schema({ timestamps: true, collection: pickupStatusSchemaName })
export class PickupStatus extends Document<Types.ObjectId> {
  // Human-readable identifier, the same idea as a payment's `reference` or a
  // user type's: it is what a URL, a table row and a support conversation
  // quote, so nobody has to pass a 24-character mongo id around.
  @Prop({ required: true })
  reference: string;

  /**
   * The name the rest of the platform matches on.
   *
   * NOT a display label: `pickup.service` and `order.service` look the seeded
   * rows up by this exact string against `PickupStatusEnum` — creating a
   * pickup finds `PENDING` by name, and the order flow compares against
   * `ASSIGNED`, `PICKED_UP` and `CANCELLED`. Rename one and those lookups miss,
   * which is why the API's update DTO does not accept this field.
   */
  @Prop({ required: true, unique: true })
  pickupStatusName: string;

  @Prop({ required: false })
  description?: string;

  @Prop({ required: true, default: true })
  isActive: boolean;
}

export const PickupStatusSchema = SchemaFactory.createForClass(PickupStatus);

PickupStatusSchema.index({ reference: 1 }, { unique: true });
