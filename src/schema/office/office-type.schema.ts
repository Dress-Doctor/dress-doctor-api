import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export const officeTypeSchemaName = 'office_type';
@Schema({ timestamps: true, collection: officeTypeSchemaName })
export class OfficeType extends Document<Types.ObjectId> {
  @Prop({ required: true, unique: true })
  officeType: string; // FACTOR OR OFFICE

  @Prop({ required: false })
  description?: string;

  @Prop({ required: true, default: true })
  isActive: boolean;
}

export const OfficeTypeSchema = SchemaFactory.createForClass(OfficeType);
