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

  /**
   * The seed's own name for this row: written once when the seeder creates it,
   * never afterwards. The seeder matches on this rather than on the display
   * name, so renaming the row in the panel cannot make the next seed run
   * insert a second copy of it.
   *
   * Only seeded rows carry one. A row somebody created by hand has none.
   */
  @Prop({ required: false })
  seedKey?: string;

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
   */
  @Prop({ required: false })
  unitPrice?: number;

  @Prop({ required: true, default: true })
  isActive: boolean;
}

export const ItemSchema = SchemaFactory.createForClass(Item);

ItemSchema.index({ reference: 1 }, { unique: true });

// Only seeded rows carry a `seedKey`, so the index is sparse: rows created by
// hand have none and must not collide with each other.
ItemSchema.index({ seedKey: 1 }, { unique: true, sparse: true });
