import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true, collection: 'currency' })
export class Currency extends Document<Types.ObjectId> {
  @Prop({ required: true, unique: true })
  isoCode: string; // XAF, USD, EUR

  @Prop({ required: true, unique: true })
  countryName: string;

  @Prop({ required: true })
  name: string; // Central African CFA Franc

  @Prop({ required: true })
  symbol: string; // FCFA

  @Prop({ required: true })
  numericCode: number; // 950 for XAF (ISO 4217)

  @Prop({ required: true, default: 2 })
  decimalPlaces: number; // 2 for most currencies

  @Prop({ required: true, default: true })
  isActive: boolean;
}

export const CurrencySchema = SchemaFactory.createForClass(Currency);
