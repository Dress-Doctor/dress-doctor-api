import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, Document } from 'mongoose';
import {
  PermissionActionEnum,
  SubjectEnum,
} from '../dto/permission-schema.dto';

export const permissionSchemaName = 'permission';
@Schema({ timestamps: true, collection: permissionSchemaName })
export class Permission extends Document<Types.ObjectId> {
  @Prop({ required: true, type: PermissionActionEnum })
  action: PermissionActionEnum;

  @Prop({ required: true, type: SubjectEnum })
  subject: SubjectEnum;

  @Prop({ required: false })
  description?: string;

  @Prop({ required: true, default: true })
  isActive: boolean;
}

export const PermissionSchema = SchemaFactory.createForClass(Permission);
