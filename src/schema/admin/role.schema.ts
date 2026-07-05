import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export const roleSchemaName = 'role';
@Schema({ timestamps: true, collection: roleSchemaName })
export class Role extends Document<Types.ObjectId> {
  @Prop({ required: true })
  roleName: string;

  @Prop({ required: false })
  description?: string;

  @Prop({ required: true, default: true })
  isActive: boolean;
}

export const RoleSchema = SchemaFactory.createForClass(Role);
