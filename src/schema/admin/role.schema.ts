import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export const roleSchemaName = 'role';
@Schema({ timestamps: true, collection: roleSchemaName })
export class Role extends Document<Types.ObjectId> {
  // Human-readable identifier, the same idea as a user type's `reference`: it
  // is what a URL, a table row and a support conversation quote, so nobody has
  // to pass a 24-character mongo id around. Minted when the role is created,
  // by the API and by the seeder alike.
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

  @Prop({ required: true })
  roleName: string;

  @Prop({ required: false })
  description?: string;

  @Prop({ required: true, default: true })
  isActive: boolean;
}

export const RoleSchema = SchemaFactory.createForClass(Role);

RoleSchema.index({ reference: 1 }, { unique: true });

// Only seeded rows carry a `seedKey`, so the index is sparse: rows created by
// hand have none and must not collide with each other.
RoleSchema.index({ seedKey: 1 }, { unique: true, sparse: true });
