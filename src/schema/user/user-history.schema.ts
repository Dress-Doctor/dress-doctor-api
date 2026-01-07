import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { User } from './user.schema';
import { ChangedFieldDto } from '../dto/user-schema.dto';
import { ActionEnum } from '../dto/permission-schema.dto';

export const userHistorySchemaName = 'user_history';
@Schema({ timestamps: true, collection: userHistorySchemaName })
export class UserHistory extends Document<Types.ObjectId> {
  @Prop({ required: true, index: true, type: Types.ObjectId, ref: User.name })
  userId: Types.ObjectId;

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

export const UserHistorySchema = SchemaFactory.createForClass(UserHistory);
