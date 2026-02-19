import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { HistoryActionEnum } from '../admin/admin.dto';
import { ChangedFieldDto } from '../user/user.dto';
import { Item } from './item.schema';
import { User } from '../user/user.schema';

@Schema({ timestamps: true, collection: 'item_history' })
export class ItemHistory extends Document<Types.ObjectId> {
  @Prop({ required: true, index: true, type: Types.ObjectId, ref: Item.name })
  itemId: Types.ObjectId;

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

  @Prop({ required: true, enum: HistoryActionEnum })
  action: HistoryActionEnum;

  @Prop({ required: false, type: Object, default: {} })
  snapshot?: Record<string, any>;
}

export const ItemHistorySchema = SchemaFactory.createForClass(ItemHistory);
