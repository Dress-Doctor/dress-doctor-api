import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export const roleSchemaName = 'role';
@Schema({ timestamps: true, collection: roleSchemaName })
export class Role extends Document<Types.ObjectId> {
  // Human-readable identifier, the same idea as a user type's `reference`: it
  // is what a URL, a table row and a support conversation quote, so nobody has
  // to pass a 24-character mongo id around.
  @Prop({ required: false })
  reference?: string;

  @Prop({ required: true })
  roleName: string;

  @Prop({ required: false })
  description?: string;

  @Prop({ required: true, default: true })
  isActive: boolean;
}

export const RoleSchema = SchemaFactory.createForClass(Role);

// Sparse, so the unique index can be built over rows written before
// `reference` existed. `npm run backfill:role-reference` fills those in.
RoleSchema.index({ reference: 1 }, { unique: true, sparse: true });
