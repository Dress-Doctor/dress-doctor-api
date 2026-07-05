import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, HydratedDocument, Types } from 'mongoose';
import { OTPChannelEnum, OTPPurposeEnum } from './otp.dto';

@Schema({ timestamps: true, collection: 'otp_security_state' })
export class OtpSecurityState extends Document<Types.ObjectId> {
  @Prop({ required: true })
  identifier: string; // normalized phone/email

  @Prop({ required: true, enum: OTPChannelEnum, default: OTPChannelEnum.EMAIL })
  channel: OTPChannelEnum;

  @Prop({ required: true, enum: OTPPurposeEnum })
  purpose: OTPPurposeEnum;

  @Prop({ default: 0 })
  requestAttempts: number;

  @Prop({ default: 0 })
  requestCoolDownLevel: number;

  @Prop({ required: false })
  requestCoolDownUntil?: Date;

  @Prop({ default: 0 })
  failedAttempts: number;

  @Prop({ default: 0 })
  verifyCoolDownLevel: number;

  @Prop({ required: false })
  verifyCoolDownUntil?: Date;

  @Prop({ default: false })
  isLocked: boolean;

  @Prop({ required: false })
  lastSuccessAt?: Date;
}

export const OtpSecurityStateSchema =
  SchemaFactory.createForClass(OtpSecurityState);

export type OtpSecurityStateDoc = HydratedDocument<OtpSecurityState>;
OtpSecurityStateSchema.index(
  { identifier: 1, channel: 1, purpose: 1 },
  { unique: true },
);
