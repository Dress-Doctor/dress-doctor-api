import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { HistoryActionEnum } from '../admin/admin.dto';
import { ChangedFieldDto } from '../user/user.dto';
import { PaymentMethod } from './payment-method.schema';

export const paymentMethodHistorySchemaName = 'payment_method_history';

/**
 * The audit trail of one payment method row — its description and whether it is
 * still offered.
 *
 * Reference data, but consequential: switching one off takes it out of every
 * picker while the payment list's method filter still reads it by name, so a reader of this trail needs
 * to see who decided that and why.
 */
@Schema({ timestamps: true, collection: paymentMethodHistorySchemaName })
export class PaymentMethodHistory extends Document<Types.ObjectId> {
  @Prop({
    index: true,
    required: true,
    type: Types.ObjectId,
    ref: PaymentMethod.name,
  })
  paymentMethodId: Types.ObjectId;

  @Prop({ required: false, type: Object, default: {} })
  changedFields?: Record<string, ChangedFieldDto>;

  @Prop({ required: true, type: String, enum: HistoryActionEnum })
  action: HistoryActionEnum;

  /**
   * Why the change was made, off the `x-change-reason` header every mutation
   * carries. Optional on the schema on purpose: a history row must never be
   * rejected for a missing field, or the audit entry is lost entirely.
   */
  @Prop({ required: false, trim: true, maxlength: 500 })
  reason?: string;

  @Prop({ required: false, type: Object, default: {} })
  snapshot?: Record<string, any>;
}

export const PaymentMethodHistorySchema =
  SchemaFactory.createForClass(PaymentMethodHistory);
