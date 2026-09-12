import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export const orderStatusSchemaName = 'order_status';
@Schema({ timestamps: true, collection: orderStatusSchemaName })
export class OrderStatus extends Document<Types.ObjectId> {
  // Human-readable identifier, the same idea as a pickup status's `reference`
  // or a user type's: it is what a URL, a table row and a support conversation
  // quote, so nobody has to pass a 24-character mongo id around.
  @Prop({ required: true })
  reference: string;

  /**
   * The name the rest of the platform matches on.
   *
   * NOT a display label, and load-bearing in a way a pickup status is not:
   * `order.service` runs the whole order state machine off this string against
   * `OrderStatusEnum` — which transitions are allowed, which are terminal —
   * and `payment.service`, `office.service`, `pickup.service` and
   * `reward.service` all look rows up by it too. Rename one and those lookups
   * miss, which is why the API's update DTO does not accept this field.
   */
  @Prop({ required: true, unique: true })
  orderStatusName: string; // RECEIVED, READY, WASHING, DELIVERED

  @Prop({ required: false })
  description?: string;

  @Prop({ required: true, default: true })
  isActive: boolean;
}

export const OrderStatusSchema = SchemaFactory.createForClass(OrderStatus);

OrderStatusSchema.index({ reference: 1 }, { unique: true });
