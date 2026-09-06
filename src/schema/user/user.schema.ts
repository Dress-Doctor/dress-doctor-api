import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { UserType } from './user-type.schema';
import { GenderEnum, PreferredLanguageEnum } from './user.dto';

@Schema({ timestamps: true, collection: 'user' })
export class User extends Document<Types.ObjectId> {
  /**
   * The human-readable identifier every user is addressed by — `US-8KQTMR`,
   * the same idea as an order's `orderCode` or a payment's `reference`.
   *
   * It exists so no URL, export or support conversation has to carry a
   * 24-character mongo id. Not `required`, because rows written before this
   * field existed have none; `npm run backfill:user-reference` fills those in.
   */
  @Prop({ required: false })
  reference: string;

  @Prop({ required: false })
  firstName: string;

  @Prop({ required: false })
  lastName: string;

  // Sparse: email is optional (customers), so multiple users without an email
  // must not collide on a null unique key.
  @Prop({ required: false, unique: true, sparse: true })
  email?: string;

  @Prop({ required: true, unique: true, index: true })
  phone: string;

  @Prop({ required: false })
  whatsappPhone: string;

  @Prop({
    required: true,
    type: String,
    enum: PreferredLanguageEnum,
    default: PreferredLanguageEnum.FRENCH,
  })
  preferredLanguage: PreferredLanguageEnum;

  @Prop({
    index: true,
    required: true,
    ref: UserType.name,
    type: Types.ObjectId,
  })
  userTypeId: Types.ObjectId;

  @Prop({ required: false, type: String, enum: GenderEnum })
  gender: GenderEnum;

  @Prop({ required: false })
  passwordHash: string;

  @Prop({ required: true, default: true })
  isActive: boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);

// Sparse, so the unique index can be built over rows written before
// `reference` existed. `npm run backfill:user-reference` fills those in.
UserSchema.index({ reference: 1 }, { unique: true, sparse: true });

// The admin user file is filtered by type and status and sorted by creation
// date, so the list path is indexed rather than scanned.
UserSchema.index({ userTypeId: 1, isActive: 1, createdAt: -1 });
