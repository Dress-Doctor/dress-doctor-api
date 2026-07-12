import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { User } from './user.schema';

export const refreshTokenSchemaName = 'refresh_token';

/**
 * Server side of a rotated refresh token. The opaque token itself is never
 * stored — only its SHA-256 hash — so a DB leak can't be replayed. On refresh
 * the presented token is rotated: the old row is revoked (`revokedAt`) and
 * linked to its successor (`replacedByTokenHash`) for reuse detection.
 */
@Schema({ timestamps: true, collection: refreshTokenSchemaName })
export class RefreshToken extends Document<Types.ObjectId> {
  @Prop({ required: true, type: Types.ObjectId, ref: User.name })
  userId: Types.ObjectId;

  @Prop({ required: true, unique: true })
  tokenHash: string;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ required: false })
  revokedAt?: Date;

  @Prop({ required: false })
  replacedByTokenHash?: string;
}

export const RefreshTokenSchema = SchemaFactory.createForClass(RefreshToken);
RefreshTokenSchema.index({ userId: 1 });
// Mongo TTL monitor purges expired rows (60s granularity).
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
