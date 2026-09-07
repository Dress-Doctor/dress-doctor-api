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

  /**
   * The label the item is read by: its name qualified by what it is filed
   * under — `Jeans (Men - Bottoms)`.
   *
   * Derived, never typed: neither create nor update DTO carries it, and
   * `itemDerived` in `src/helper/catalog` is what builds it. Stored rather
   * than computed on read so `q` can search it and an index can order by it,
   * which is why every write that can change an input recomputes it —
   * including a category or sub-category rename, which changes this field on
   * every item filed under that row.
   *
   * Optional on the schema because rows written before the column existed
   * have none until `npm run backfill:item-derived` has run.
   */
  @Prop({ required: false, index: true })
  displayName?: string;

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

  /**
   * The midpoint of the range above, rounded to a whole unit — what one
   * garment costs before anything is agreed at the counter.
   *
   * Derived from `priceLow` and `priceHigh` and never typed, so it cannot
   * drift from the range it summarises. Not the same field as
   * `OrderItem.unitPrice`, which records what was actually charged on a line;
   * this is the list price that one starts from.
   *
   * Optional for the same reason as `displayName`: rows predating the column
   * have none until the backfill has run.
   */
  @Prop({ required: false })
  unitPrice?: number;

  @Prop({ required: true, default: true })
  isActive: boolean;
}

export const ItemSchema = SchemaFactory.createForClass(Item);

// Sparse, so the unique index can be built over rows written before
// `reference` existed. `npm run backfill:item-reference` fills those in.
ItemSchema.index({ reference: 1 }, { unique: true, sparse: true });
