import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { ActionEnum } from '../admin/admin.dto';
import { ChangedFieldDto } from '../user/user.dto';
import { User } from '../user/user.schema';
import { Payment } from './payment.schema';

export const paymentHistorySchemaName = 'paymentHistory';
@Schema({ timestamps: true, collection: paymentHistorySchemaName })
export class PaymentHistory extends Document<Types.ObjectId> {
  @Prop({
    index: true,
    required: true,
    ref: Payment.name,
    type: Types.ObjectId,
  })
  paymentId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: User.name })
  changedBy: Types.ObjectId;

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

export const PaymentHistorySchema =
  SchemaFactory.createForClass(PaymentHistory);
