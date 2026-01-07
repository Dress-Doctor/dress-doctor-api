import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { PlatformEnum } from './admin.dto';
import { User } from '../user/user.schema';

@Schema({ timestamps: true, collection: 'api_client' })
export class ApiClient extends Document<Types.ObjectId> {
  @Prop({ required: true, unique: true })
  name: string;

  @Prop({ required: false })
  description?: string;

  @Prop({ required: true, type: Types.ObjectId, ref: User.name })
  createdBy: Types.ObjectId;

  @Prop({ required: true, unique: true })
  key: string;

  @Prop({ required: true, unique: true })
  secretHash: string;

  @Prop({ required: true, type: [String], enum: PlatformEnum })
  scope: PlatformEnum[];

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ required: true, default: true })
  isActive: boolean;
}

export const ApiClientSchema = SchemaFactory.createForClass(ApiClient);
