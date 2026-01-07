import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, Document } from 'mongoose';
import { GenderEnum, PreferredLanguageEnum } from '../dto/user-schema.dto';
import { UserType } from './user-type.schema';

export const userSchemaName = 'user';
@Schema({ timestamps: true, collection: userSchemaName })
export class User extends Document<Types.ObjectId> {
  @Prop({ required: false })
  firstName: string;

  @Prop({ required: false })
  lastName: string;

  @Prop({ required: false, unique: true })
  email?: string;

  @Prop({ required: true, unique: true, index: true })
  phone: string;

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

  @Prop({ required: true, type: GenderEnum })
  gender: GenderEnum;

  @Prop({ required: true })
  passwordHash: string;

  @Prop({ default: true })
  isActive: boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);
