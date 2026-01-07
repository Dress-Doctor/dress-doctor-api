import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, Document } from 'mongoose';
import { User } from './user.schema';
import { OTPChannelEnum, OTPPurposeEnum } from '../dto/user-schema.dto';

export const otpCodeSchemaName = 'otp_code';
@Schema({ timestamps: true, collection: otpCodeSchemaName })
export class OtpCode extends Document<Types.ObjectId> {
  @Prop({ required: true, type: Types.ObjectId, ref: User.name })
  userId: Types.ObjectId;

  @Prop({ required: true, enum: OTPChannelEnum, default: OTPChannelEnum.EMAIL })
  channel: OTPChannelEnum;

  @Prop({ required: true, enum: OTPPurposeEnum })
  purpose: OTPPurposeEnum;

  @Prop({ required: true, unique: true })
  code: string;

  @Prop({ required: true })
  expiredAt: Date;

  @Prop({ required: true, default: false })
  isUsed: boolean;

  @Prop({ required: true, default: true })
  isActive: boolean;
}

export const OtpCodeSchema = SchemaFactory.createForClass(OtpCode);
