import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { OTPChannelEnum } from '../otp/otp.dto';

@Schema({ timestamps: true, collection: 'notification_template' })
export class NotificationTemplate extends Document<Types.ObjectId> {
  @Prop({ required: true })
  templateName: string;

  @Prop({ required: true, type: String, enum: OTPChannelEnum })
  channel: OTPChannelEnum;

  @Prop({ required: true })
  titleEn: string; // Email subject

  @Prop({ required: true })
  titleFr: string; // Email subject

  @Prop({ required: false, default: [] })
  variables?: string[];
}

export const NotificationTemplateSchema =
  SchemaFactory.createForClass(NotificationTemplate);

NotificationTemplateSchema.index({ templateName: 1, channel: 1 });
