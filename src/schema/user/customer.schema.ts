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

  /**
   * What this row was called in the 2026 Sales sheet it came from — `CU-0001`.
   *
   * Written once by `migrate-sales`, and the only thing that makes that
   * migration re-runnable: the codes here are minted fresh, so without this
   * there is nothing to recognise an already-imported row by, and a second run
   * would import the whole ledger again.
   *
   * Only migrated rows carry one. Anything entered since has none, which is
   * why the index is sparse.
   */
  @Prop({ required: false })
  legacyCode?: string;

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

  // Cached Σ(reward_ledger.points) — recomputed from the ledger inside the
  // same transaction as every ledger write (§10). Never hand-set.
  @Prop({ required: true, default: 0 })
  rewardPoints: number;

  // Cached tier, recomputed by the accrual job from totalSpend/totalOrders.
  @Prop({ required: false, type: Types.ObjectId, ref: 'RewardTier' })
  rewardTierId?: Types.ObjectId;

  @Prop({ required: true, default: () => new Date() })
  registeredAt: Date;

  // Transactional messages (§2.5): order READY/DELIVERED + payment receipts.
  // Default on — customers can opt out; the listener checks before enqueueing.
  @Prop({ required: true, default: true })
  notificationsOptIn: boolean;
}

export const CustomerSchema = SchemaFactory.createForClass(Customer);
CustomerSchema.index({ lastOrderAt: -1 });
CustomerSchema.index({ homeOfficeId: 1 });
// The customers list filters on a registeredAt window and sorts by it.
CustomerSchema.index({ registeredAt: -1 });
// Only migrated rows carry a `legacyCode`, so the index is sparse: rows
// entered since have none and must not collide with each other.
CustomerSchema.index({ legacyCode: 1 }, { unique: true, sparse: true });
