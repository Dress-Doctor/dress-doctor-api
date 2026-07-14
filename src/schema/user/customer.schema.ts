import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Office } from '../office/office.schema';
import { Referral } from './referral.schema';
import { User } from './user.schema';

export const customerSchemaName = 'customer';

/**
 * Thin 1:1 profile on top of a customer `User`. Customers are NOT office-owned —
 * `homeOfficeId` is reporting-only. The rollups (`lastOrderAt`, `totalOrders`,
 * `totalSpend`) are system-maintained: `lastOrderAt` on order create,
 * `totalOrders`/`totalSpend` on order paid — never hand-set.
 */
@Schema({ timestamps: true, collection: customerSchemaName })
export class Customer extends Document<Types.ObjectId> {
  @Prop({ required: true, type: Types.ObjectId, ref: User.name, unique: true })
  userId: Types.ObjectId;

  @Prop({ required: true, unique: true })
  customerCode: string;

  @Prop({ required: true, unique: true })
  referralCode: string;

  @Prop({ required: false })
  pickupAddress?: string;

  // Reporting only, not ownership — a customer can order at any office.
  @Prop({ required: false, type: Types.ObjectId, ref: Office.name })
  homeOfficeId?: Types.ObjectId;

  // The referral this customer was brought in by; null if organic.
  @Prop({ required: false, type: Types.ObjectId, ref: Referral.name })
  referredBy?: Types.ObjectId;

  @Prop({ required: false })
  lastOrderAt?: Date;

  @Prop({ required: true, default: 0 })
  totalOrders: number;

  @Prop({ required: true, default: 0 })
  totalSpend: number;

  @Prop({ required: true, default: () => new Date() })
  registeredAt: Date;
}

export const CustomerSchema = SchemaFactory.createForClass(Customer);
CustomerSchema.index({ lastOrderAt: -1 });
CustomerSchema.index({ homeOfficeId: 1 });
