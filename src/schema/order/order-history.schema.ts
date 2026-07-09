import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { HistoryActionEnum } from '../admin/admin.dto';
import { ChangedFieldDto } from '../user/user.dto';
import { User } from '../user/user.schema';
import { Order } from './order.schema';

export const orderHistorySchemaName = 'order_history';
@Schema({ timestamps: true, collection: orderHistorySchemaName })
export class OrderHistory extends Document<Types.ObjectId> {
  @Prop({ required: true, index: true, type: Types.ObjectId, ref: Order.name })
  orderId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: User.name })
  changedBy: Types.ObjectId;

  @Prop({ required: false, type: Object, default: {} })
  changedFields?: Record<string, ChangedFieldDto>;

  @Prop({ required: true, type: String, enum: HistoryActionEnum })
  action: HistoryActionEnum;

  @Prop({ required: false, type: Object, default: {} })
  snapshot?: Record<string, any>;
}

export const OrderHistorySchema = SchemaFactory.createForClass(OrderHistory);
