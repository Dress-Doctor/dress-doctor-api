import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, Document, HydratedDocument } from 'mongoose';
import { GenderEnum, PreferredLanguageEnum } from './user.dto';
import { UserType } from './user-type.schema';

@Schema({ timestamps: true, collection: 'user' })
export class User extends Document<Types.ObjectId> {
  @Prop({ required: false })
  firstName: string;

  @Prop({ required: false })
  lastName: string;

  @Prop({ required: false, unique: true })
  email?: string;

  @Prop({ required: true, unique: true, index: true })
  phone: string;

  @Prop({ required: false })
  whatsappPhone: string;

  @Prop({
    required: true,
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

  @Prop({ required: false, enum: GenderEnum })
  gender: GenderEnum;

  @Prop({ required: false })
  passwordHash: string;

  @Prop({ required: true, default: true })
  isActive: boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);
