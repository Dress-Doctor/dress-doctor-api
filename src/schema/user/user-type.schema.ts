import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, Document } from 'mongoose';

export const userTypeSchemaName = 'user_type';
@Schema({ timestamps: true, collection: userTypeSchemaName })
export class UserType extends Document<Types.ObjectId> {
  @Prop({ required: true })
  userTypeName: string; // ADMIN, OFFICE MANAGER

  @Prop({ required: false })
  description?: string;

  @Prop({ required: true, default: true })
  isActive: boolean;
}

export const UserTypeSchema = SchemaFactory.createForClass(UserType);
