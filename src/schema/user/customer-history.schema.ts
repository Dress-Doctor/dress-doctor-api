import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { ActionEnum } from '../admin/admin.dto';
import { Customer } from './customer.schema';
import { User } from './user.schema';

export const customerHistorySchemaName = 'customer_history';
@Schema({ timestamps: true, collection: customerHistorySchemaName })
export class CustomerHistory extends Document<Types.ObjectId> {
  @Prop({ required: true, type: Types.ObjectId, ref: Customer.name })
  customerId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: User.name })
  changedBy: Types.ObjectId;

  @Prop({ required: false, type: Object })
  changedFields?: Record<string, any>;

  @Prop({ required: true, enum: ActionEnum })
  action: ActionEnum;

  @Prop({ required: false, type: Object, default: {} })
  snapshot?: Record<string, any>;
}

export const CustomerHistorySchema =
  SchemaFactory.createForClass(CustomerHistory);
