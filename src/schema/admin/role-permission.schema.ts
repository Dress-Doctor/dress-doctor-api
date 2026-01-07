import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, Schema as MongooseSchema } from 'mongoose';
import { Permission } from './permission.schema';
import { Role } from './role.schema';
import { ScopeEnum } from '../dto/permission-schema.dto';

export const rolePermissionSchemaName = 'role_permission';
@Schema({ timestamps: true, collection: rolePermissionSchemaName })
export class RolePermission extends Document<Types.ObjectId> {
  @Prop({ required: true, type: Types.ObjectId, ref: Role.name, index: true })
  roleId: Types.ObjectId;

  @Prop({
    index: true,
    required: true,
    ref: Permission.name,
    type: Types.ObjectId,
  })
  permissionId: Types.ObjectId;

  @Prop({ required: true, enum: ScopeEnum })
  scope: ScopeEnum;

  @Prop({ type: Map, of: MongooseSchema.Types.Mixed, default: {} })
  conditions: Map<string, any>;
}

export const RolePermissionSchema =
  SchemaFactory.createForClass(RolePermission);
