import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Currency } from './currency.schema';
import { ServiceType } from './service-type.schema';
import { Service } from './service.schema';

export const itemSchemaName = 'item';

@Schema({ timestamps: true, collection: itemSchemaName })
export class Item extends Document<Types.ObjectId> {
  // Human-readable identifier. Every single-row read and write of an item is
  // addressed by this, never by the mongo id.
  @Prop({ required: true })
  reference: string;

  @Prop({ required: true, unique: true })
  itemName: string; // T-Shirt, Polo Shirt, Dress Shirt

  @Prop({ required: true, type: Types.ObjectId, ref: Service.name })
  serviceId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: ServiceType.name })
  serviceTypeId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: Currency.name })
  currencyId: Types.ObjectId;

  @Prop({ required: true })
  priceLow: number; // XAF

  @Prop({ required: true })
  priceHigh: number; // XAF

  @Prop({ required: true, default: true })
  isActive: boolean;
}

export const ItemSchema = SchemaFactory.createForClass(Item);

// Sparse, so the unique index can be built over rows written before
// `reference` existed. `npm run backfill:item-reference` fills those in.
ItemSchema.index({ reference: 1 }, { unique: true, sparse: true });
