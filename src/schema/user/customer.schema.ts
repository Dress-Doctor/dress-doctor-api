import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { User } from './user.schema';

export const customerSchemaName = 'customer';
@Schema({ timestamps: true, collection: customerSchemaName })
export class Customer extends Document<Types.ObjectId> {
  @Prop({ required: true, type: Types.ObjectId, ref: User.name })
  userId: Types.ObjectId;

  @Prop({ required: true, unique: true })
  referralCode: string;
}

export const CustomerSchema = SchemaFactory.createForClass(Customer);
