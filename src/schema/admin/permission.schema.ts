import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, Document } from 'mongoose';
import { PermissionActionEnum, SubjectEnum } from './admin.dto';

export const permissionSchemaName = 'permission';
@Schema({ timestamps: true, collection: permissionSchemaName })
export class Permission extends Document<Types.ObjectId> {
  @Prop({ required: true, type: String, enum: PermissionActionEnum })
  action: PermissionActionEnum;

  @Prop({ required: true, type: String, enum: SubjectEnum })
  subject: SubjectEnum;

  @Prop({ required: false })
  description?: string;

  @Prop({ required: true, default: true })
  isActive: boolean;
}

export const PermissionSchema = SchemaFactory.createForClass(Permission);
