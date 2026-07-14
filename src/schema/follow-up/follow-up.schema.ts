import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Customer } from '../user/customer.schema';
import { Notification } from '../notification/notification.schema';
import { User } from '../user/user.schema';

export const followUpSchemaName = 'follow_up';

/**
 * One row per inactivity alert sent to Customer Service. An unresolved row with
 * cooldownUntil in the future blocks the nightly scan from re-alerting the same
 * customer (and makes a mid-run retry idempotent — the row is written before
 * the alert is enqueued). Resolving clears the block.
 */
@Schema({ timestamps: true, collection: followUpSchemaName })
export class FollowUp extends Document<Types.ObjectId> {
  @Prop({ required: true, type: Types.ObjectId, ref: Customer.name })
  customerId: Types.ObjectId;

  // When the scan flagged this customer.
  @Prop({ required: true })
  triggeredAt: Date;

  // The customer's lastOrderAt at trigger time (context snapshot).
  @Prop({ required: false })
  lastOrderAt?: Date;

  // Delivery-log row of the CS alert — set after the notification is enqueued,
  // so "who was contacted, when, did they respond" is reportable end-to-end.
  @Prop({ required: false, type: Types.ObjectId, ref: Notification.name })
  notificationId?: Types.ObjectId;

  // No re-alert for this customer before this instant (unless resolved).
  @Prop({ required: true })
  cooldownUntil: Date;

  @Prop({ required: false })
  resolvedAt?: Date;

  @Prop({ required: false, type: Types.ObjectId, ref: User.name })
  resolvedBy?: Types.ObjectId;

  @Prop({ required: false })
  resolutionNote?: string;
}

export const FollowUpSchema = SchemaFactory.createForClass(FollowUp);
// The scan's cooldown check: active (unresolved) follow-up per customer.
FollowUpSchema.index({ customerId: 1, resolvedAt: 1, cooldownUntil: -1 });
// List path: recent follow-ups first.
FollowUpSchema.index({ triggeredAt: -1 });
