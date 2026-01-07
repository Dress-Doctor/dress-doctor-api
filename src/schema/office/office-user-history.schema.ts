import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, Document, Schema as MongooseSchema } from 'mongoose';
import { OfficeUser } from './office-user.schema';
import { User } from '../user/user.schema';
import { ActionEnum } from '../dto/permission-schema.dto';
import { ChangedFieldDto } from '../dto/user-schema.dto';

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

  @Prop({ required: true, enum: ActionEnum })
  action: ActionEnum;

  @Prop({ required: false, type: Object, default: {} })
  snapshot?: Record<string, any>;
}

export const OfficeUserHistorySchema =
  SchemaFactory.createForClass(OfficeUserHistory);
