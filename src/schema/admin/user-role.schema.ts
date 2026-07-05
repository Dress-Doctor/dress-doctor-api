import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, Document } from 'mongoose';
import { User } from '../user/user.schema';
import { Role } from './role.schema';

export const userRoleSchemaName = 'user_role';
@Schema({ timestamps: true, collection: userRoleSchemaName })
export class UserRole extends Document<Types.ObjectId> {
  @Prop({ required: true, type: Types.ObjectId, ref: Role.name, index: true })
  roleId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: User.name, index: true })
  userId: Types.ObjectId;
}

export const UserRoleSchema = SchemaFactory.createForClass(UserRole);
