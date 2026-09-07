import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export const currencySchemaName = 'currency';

@Schema({ timestamps: true, collection: currencySchemaName })
export class Currency extends Document<Types.ObjectId> {
  // Human-readable identifier. Every single-row read and write of a currency
  // is addressed by this, never by the mongo id.
  @Prop({ required: true })
  reference: string;

  /**
   * The ISO 4217 code the rest of the platform matches on.
   *
   * NOT a display label: `payment.service` looks the house currency up with
   * `findOne({ isoCode: 'XAF' })`, so a rename would leave that finding
   * nothing. This is why the API's update DTO does not accept the field.
   */
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

// Sparse, so the unique index can be built over rows written before
// `reference` existed. `npm run backfill:currency-reference` fills those in.
CurrencySchema.index({ reference: 1 }, { unique: true, sparse: true });
