import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, Document } from 'mongoose';
import { User } from '../user/user.schema';
import { PickupTimeEnum } from '../dto/pickup-request-schema.dto';
import { Office } from '../user/office.schema';
import { PickupStatus } from './pickup-status.schema';

export const pickupRequestSchemaName = 'pickup_request';
@Schema({ timestamps: true, collection: pickupRequestSchemaName })
export class PickupRequest extends Document<Types.ObjectId> {
  @Prop({ required: true, index: true, type: Types.ObjectId, ref: User.name })
  customerId: Types.ObjectId;

  @Prop({ required: true })
  pickupAddress: string;

  @Prop({ required: true })
  pickupDate: Date;

  @Prop({ required: true, type: PickupTimeEnum })
  pickupTime: PickupTimeEnum;

  @Prop({ required: false })
  note?: string;

  @Prop({ required: true, type: Types.ObjectId, ref: PickupStatus.name })
  pickupStatusId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: User.name })
  confirmedBy: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: Office.name })
  officeId: Types.ObjectId;
}

export const PickupRequestSchema = SchemaFactory.createForClass(PickupRequest);
