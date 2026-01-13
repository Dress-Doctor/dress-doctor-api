import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, Document, Schema as MongooseSchema } from 'mongoose';
import { OfficeUser } from './office-user.schema';
import { User } from '../user/user.schema';
import { ChangedFieldDto } from '../user/user.dto';
import { HistoryActionEnum } from '../admin/admin.dto';

export const officeUserHistorySchemaName = 'office_user_history';
@Schema({ timestamps: true, collection: officeUserHistorySchemaName })
export class OfficeUserHistory extends Document<Types.ObjectId> {
  @Prop({ required: true, type: Types.ObjectId, ref: OfficeUser.name })
  officeUserId: Types.ObjectId;

  @Prop({ required: true, index: true, type: Types.ObjectId, ref: User.name })
  userId: Types.ObjectId;

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

  @Prop({ required: true, enum: HistoryActionEnum })
  action: HistoryActionEnum;

  @Prop({ required: false, type: Object, default: {} })
  snapshot?: Record<string, any>;
}

export const OfficeUserHistorySchema =
  SchemaFactory.createForClass(OfficeUserHistory);
