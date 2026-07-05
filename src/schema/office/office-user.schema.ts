import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, Document } from 'mongoose';
import { Office } from './office.schema';
import { User } from '../user/user.schema';
import { Role } from '../admin/role.schema';

export const officeUserSchemaName = 'office_user';
@Schema({ timestamps: true, collection: officeUserSchemaName })
export class OfficeUser extends Document<Types.ObjectId> {
  @Prop({ required: true, index: true, type: Types.ObjectId, ref: Office.name })
  officeId: Types.ObjectId;

  @Prop({ required: true, index: true, type: Types.ObjectId, ref: User.name })
  userId: Types.ObjectId;

  @Prop({ required: true, index: true, type: Types.ObjectId, ref: Role.name })
  roleId: Types.ObjectId;

  @Prop({ required: true, default: true })
  isActive: boolean;
}

export const OfficeUserSchema = SchemaFactory.createForClass(OfficeUser);
