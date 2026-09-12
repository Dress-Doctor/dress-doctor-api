import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, Document } from 'mongoose';

export const userTypeSchemaName = 'user_type';
@Schema({ timestamps: true, collection: userTypeSchemaName })
export class UserType extends Document<Types.ObjectId> {
  // Human-readable identifier, the same idea as a payment's `reference` or an
  // order's `orderCode`: it is what a URL, a table row and a support
  // conversation quote, so nobody has to pass a 24-character mongo id around.
  @Prop({ required: true })
  reference: string;

  /**
   * The name the rest of the platform matches on.
   *
   * NOT a display label: `auth.service` puts it straight into the JWT as the
   * `userType` claim and compares it against `UserTypeEum.CUSTOMER`,
   * `user.service` branches on CUSTOMER and ADMIN when creating a user, and
   * `pickup.service` and `customer.service` look the seeded rows up by it.
   * Rename one and those lookups miss, which is why the API's update DTO does
   * not accept this field.
   */
  @Prop({ required: true, unique: true })
  userTypeName: string; // ADMIN, OFFICE MANAGER

  @Prop({ required: false })
  description?: string;

  @Prop({ required: true, default: true })
  isActive: boolean;
}

export const UserTypeSchema = SchemaFactory.createForClass(UserType);

UserTypeSchema.index({ reference: 1 }, { unique: true });
