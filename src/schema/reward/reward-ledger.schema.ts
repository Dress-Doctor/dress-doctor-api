import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Order } from '../order/order.schema';
import { User } from '../user/user.schema';
import { RewardLedgerTypeEnum } from './reward.dto';

export const rewardLedgerSchemaName = 'reward_ledger';

/**
 * Append-only points ledger — THE source of truth for reward balances (§10).
 * `customers.rewardPoints` only caches Σ(points); it is recomputed from this
 * collection inside the same transaction as every write, never hand-set.
 * `points` is signed: EARN > 0, REDEEM < 0, ADJUST either.
 *
 * `customerId` references the customer's User id (same convention as
 * Order/Payment), so the seeded `{ customerId: '$self' }` CASL condition
 * self-scopes reads.
 */
@Schema({ timestamps: true, collection: rewardLedgerSchemaName })
export class RewardLedger extends Document<Types.ObjectId> {
  @Prop({ required: true, type: Types.ObjectId, ref: User.name, index: true })
  customerId: Types.ObjectId;

  @Prop({ required: true, type: String, enum: RewardLedgerTypeEnum })
  type: RewardLedgerTypeEnum;

  // Signed integer points; the invariant Σ(points) ≥ 0 per customer is
  // enforced by the redemption balance check.
  @Prop({ required: true })
  points: number;

  @Prop({ required: false, type: Types.ObjectId, ref: Order.name })
  orderId?: Types.ObjectId;

  @Prop({ required: false })
  reason?: string;

  // Breakdown for EARN rows ({ accrual, milestone }) / audit context for others.
  @Prop({ required: false, type: Object, default: {} })
  meta?: Record<string, number>;
}

export const RewardLedgerSchema = SchemaFactory.createForClass(RewardLedger);
// Idempotency backstop: at most one EARN and one REDEEM row per order — a
// re-emitted order.paid (or a redeem retry) hits E11000 instead of
// double-crediting. ADJUST rows carry no orderId and are unaffected.
RewardLedgerSchema.index(
  { orderId: 1, type: 1 },
  { unique: true, partialFilterExpression: { orderId: { $exists: true } } },
);
RewardLedgerSchema.index({ customerId: 1, createdAt: -1 });
