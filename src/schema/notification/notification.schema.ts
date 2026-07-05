import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { User } from '../user/user.schema';
import { LanguageEum, NotificationStatusEnum } from './notification.dto';
import { OTPChannelEnum } from '../otp/otp.dto';

@Schema({ timestamps: true, collection: 'notification' })
export class Notification extends Document<Types.ObjectId> {
  @Prop({ required: true, type: Types.ObjectId, ref: User.name })
  userId: Types.ObjectId;

  @Prop({ required: true, type: String, enum: OTPChannelEnum })
  channel: OTPChannelEnum;

  @Prop({ required: true, type: String, enum: NotificationStatusEnum })
  status: NotificationStatusEnum;

  @Prop({ required: true })
  title: string; // Email subject

  @Prop({ required: true })
  body: string;

  @Prop({ required: false, type: Object, default: {} })
  variables?: Record<string, string>;

  @Prop({ required: true, type: String, enum: LanguageEum })
  language: LanguageEum;

  @Prop({ required: true })
  sentAt: Date;

  @Prop({ required: false })
  providerResponse: string;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);
