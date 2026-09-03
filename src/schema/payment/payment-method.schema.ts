import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export const paymentMethodSchemaName = 'payment_method';
@Schema({ timestamps: true, collection: paymentMethodSchemaName })
export class PaymentMethod extends Document<Types.ObjectId> {
  // Human-readable identifier, the same idea as a payment's own `reference`:
  // it is what a URL, a table row and a support conversation quote, so nobody
  // has to pass a 24-character mongo id around.
  @Prop({ required: true })
  reference: string;

  /**
   * The name the rest of the platform matches on.
   *
   * NOT a display label, and mixed-case on purpose: the seeded values are
   * `Cash`, `MTN Momo` and `Orange Money`, spelled exactly that way in
   * `PaymentMethodEnum`, and `payment.service` resolves the payment list's
   * `paymentMethod` filter with an exact `findOne` on this string — no
   * case-folding. Rename one and that filter silently matches nothing, which
   * is why the API's update DTO does not accept this field.
   */
  @Prop({ required: true, unique: true })
  paymentMethodName: string; // Cash, MTN Momo, Orange Money

  @Prop({ required: false })
  description?: string;

  @Prop({ required: true, default: true })
  isActive: boolean;
}

export const PaymentMethodSchema = SchemaFactory.createForClass(PaymentMethod);

// Sparse, so the unique index can be built over rows written before
// `reference` existed. `npm run backfill:payment-method-reference` fills those in.
PaymentMethodSchema.index({ reference: 1 }, { unique: true, sparse: true });
