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

  // Provider message id — the key the inbound status webhook matches on to flip
  // this row to DELIVERED/READ/FAILED.
  @Prop({ required: false })
  providerMessageId?: string;

  @Prop({ required: false })
  deliveredAt?: Date;

  @Prop({ required: false })
  readAt?: Date;

  @Prop({ required: false })
  failedAt?: Date;

  // Inactivity alerts only: the follow-up row this delivery belongs to.
  @Prop({ required: false, type: Types.ObjectId })
  followUpId?: Types.ObjectId;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);
NotificationSchema.index({ providerMessageId: 1 });
