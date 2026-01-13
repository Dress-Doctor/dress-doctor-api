import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, Document, HydratedDocument } from 'mongoose';
import { OTPChannelEnum, OTPPurposeEnum } from './otp.dto';

@Schema({ timestamps: true, collection: 'otp_request' })
export class OtpRequest extends Document<Types.ObjectId> {
  @Prop({ required: true })
  identifier: string;

  @Prop({ required: true, enum: OTPChannelEnum })
  channel: OTPChannelEnum;

  @Prop({ required: true, enum: OTPPurposeEnum })
  purpose: OTPPurposeEnum;

  @Prop({ required: true })
  codeHash: string;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ required: false })
  usedAt?: Date;

  @Prop({ required: true, default: false })
  isUsed: boolean;
}

export type OtpRequestDoc = HydratedDocument<OtpRequest>;
export const OtpRequestSchema = SchemaFactory.createForClass(OtpRequest);
