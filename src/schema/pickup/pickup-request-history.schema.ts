import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { ActionEnum } from '../dto/permission-schema.dto';
import { ChangedFieldDto } from '../dto/user-schema.dto';
import { User } from '../user/user.schema';
import { PickupRequest } from './pickup-request.schema';

export const pickupRequestHistorySchemaName = 'pickup_request_history';
@Schema({ timestamps: true, collection: pickupRequestHistorySchemaName })
export class PickupRequestHistory extends Document<Types.ObjectId> {
  @Prop({
    index: true,
    required: true,
    type: Types.ObjectId,
    ref: PickupRequest.name,
  })
  pickupRequestId: Types.ObjectId;

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

export const PickupRequestHistorySchema =
  SchemaFactory.createForClass(PickupRequestHistory);
