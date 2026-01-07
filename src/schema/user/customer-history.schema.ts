import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, Schema as MongooseSchema } from 'mongoose';
import { User } from './user.schema';
import { Customer } from './customer.schema';
import { ChangedFieldDto } from './user.dto';
import { ActionEnum } from '../admin/admin.dto';

export const customerHistorySchemaName = 'customer_history';
@Schema({ timestamps: true, collection: customerHistorySchemaName })
export class CustomerHistory extends Document<Types.ObjectId> {
  @Prop({ required: true, type: Types.ObjectId, ref: Customer.name })
  customerId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: User.name })
  changeId: Types.ObjectId;

  @Prop({
    required: false,
    type: [
      {
        field: String,
        to: MongooseSchema.Types.Mixed,
        from: MongooseSchema.Types.Mixed,
      },
    ],
    default: [],
  })
  changedFields?: ChangedFieldDto[];

  @Prop({ required: true, enum: ActionEnum })
  action: ActionEnum;

  @Prop({ required: false, type: Object, default: {} })
  snapshot?: Record<string, any>;
}

export const CustomerHistorySchema =
  SchemaFactory.createForClass(CustomerHistory);
