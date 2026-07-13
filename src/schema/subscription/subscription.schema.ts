import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Office } from '../office/office.schema';
import { User } from '../user/user.schema';
import { SubscriptionStatusEnum } from './subscription.dto';

export const subscriptionSchemaName = 'subscription';

/**
 * A customer's plan enrolment. Orders on the Subscription pricing model draw on
 * `remainingQuota`; overage beyond it is charged on the order (§6-8). The plan
 * fee itself is billed by subscription-billing (Phase 5). Minimal for Phase 1 —
 * planId/period fields fill in when subscription-plans land.
 */
@Schema({ timestamps: true, collection: subscriptionSchemaName })
export class Subscription extends Document<Types.ObjectId> {
  @Prop({ required: true, type: Types.ObjectId, ref: User.name })
  customerId: Types.ObjectId;

  @Prop({ required: false, type: Types.ObjectId })
  planId?: Types.ObjectId;

  @Prop({ required: false, type: Types.ObjectId, ref: Office.name })
  officeId?: Types.ObjectId;

  @Prop({
    required: true,
    type: String,
    enum: SubscriptionStatusEnum,
    default: SubscriptionStatusEnum.ACTIVE,
  })
  status: SubscriptionStatusEnum;

  @Prop({ required: false })
  currentPeriodStart?: Date;

  @Prop({ required: false })
  currentPeriodEnd?: Date;

  // Remaining covered quota (kg) for the current period; decremented per order.
  @Prop({ required: true, default: 0 })
  remainingQuota: number;

  @Prop({ required: true, default: false })
  autoRenew: boolean;
}

export const SubscriptionSchema = SchemaFactory.createForClass(Subscription);
SubscriptionSchema.index({ customerId: 1 });
SubscriptionSchema.index({ status: 1, currentPeriodEnd: 1 });
