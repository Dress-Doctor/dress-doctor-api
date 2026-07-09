import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { OfficeType } from './office-type.schema';

export const officeSchemaName = 'office';
@Schema({ timestamps: true, collection: officeSchemaName })
export class Office extends Document<Types.ObjectId> {
  @Prop({
    index: true,
    required: true,
    ref: OfficeType.name,
    type: Types.ObjectId,
  })
  officeTypeId: Types.ObjectId;

  @Prop({ required: true, unique: true })
  officeName: string;

  @Prop({ required: true, unique: true, immutable: true })
  officeCode: string;

  @Prop({ required: true, unique: true, lowercase: true })
  slug: string;

  @Prop({ required: false, unique: true, sparse: true })
  qrCodeUrl: string;

  @Prop({ required: true })
  address: string;

  @Prop({ required: true })
  city: string;

  @Prop({ required: true })
  region: string;

  @Prop({ required: true, unique: true })
  signedLink: string;

  @Prop({ required: true, default: true })
  isActive: boolean;
}

export const OfficeSchema = SchemaFactory.createForClass(Office);
