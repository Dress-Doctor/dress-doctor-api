import type { MongoQuery } from '@casl/ability';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { ScopeEnum } from './admin.dto';
import { Permission } from './permission.schema';
import { Role } from './role.schema';

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

  @Prop({ required: true, type: String, enum: ScopeEnum })
  scope: ScopeEnum;

  @Prop({ type: Object })
  conditions: MongoQuery<any>;
}

export const RolePermissionSchema =
  SchemaFactory.createForClass(RolePermission);
