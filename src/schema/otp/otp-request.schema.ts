import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, Document, HydratedDocument } from 'mongoose';
import { OTPChannelEnum, OTPPurposeEnum } from './otp.dto';
import { v4 as uuid4 } from 'uuid';

@Schema({ timestamps: true, collection: 'otp_request' })
export class OtpRequest extends Document<Types.ObjectId> {
  @Prop({ required: true, type: Types.UUID, default: uuid4 })
  otpRef: string;

  @Prop({ required: true })
  identifier: string;

  @Prop({ required: true, type: String, enum: OTPChannelEnum })
  channel: OTPChannelEnum;

  @Prop({ required: true, type: String, enum: OTPPurposeEnum })
  purpose: OTPPurposeEnum;

  @Prop({ required: true })
  codeHash: string;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ required: false })
  usedAt?: Date;

  @Prop({ required: true, default: false })
  isUsed: boolean;

  /**
   * When a later request for the same identifier and purpose replaced this
   * code. Kept apart from `isUsed`, which means somebody signed in with it:
   * a superseded code was never used, and reading one as the other would
   * misreport how an account was actually accessed.
   */
  @Prop({ required: false })
  supersededAt?: Date;
}

export type OtpRequestDoc = HydratedDocument<OtpRequest>;
export const OtpRequestSchema = SchemaFactory.createForClass(OtpRequest);

// The verify lookup. `otpRef` is a UUID, so this alone settles the row.
OtpRequestSchema.index({ otpRef: 1 });
// The sweep a new request runs first, to retire whatever is still outstanding.
OtpRequestSchema.index({ identifier: 1, purpose: 1, isUsed: 1 });
/**
 * A code is dead five minutes after it is issued, so the row has nothing left
 * to say. Mongo's TTL monitor purges it (60s granularity) — the same treatment
 * a refresh token gets, and for the same reason: it holds a hash and an
 * identifier, neither of which is worth keeping once it can no longer be used.
 *
 * Nothing is lost from the audit trail. `auth.otp_requested` is recorded
 * against the `activity` collection, which has its own retention.
 */
OtpRequestSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
