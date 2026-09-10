import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, Document } from 'mongoose';

export const subCategorySchemaName = 'sub_category';

@Schema({ timestamps: true, collection: subCategorySchemaName })
export class SubCategory extends Document<Types.ObjectId> {
  // Human-readable identifier. Every single-row read and write of a sub
  // category is addressed by this, never by the mongo id.
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
  subCategoryName: string; // Top, Dresses, Full Set, Bathroom

  @Prop({ required: false })
  description?: string;

  @Prop({ required: true, default: true })
  isActive: boolean;
}

export const SubCategorySchema = SchemaFactory.createForClass(SubCategory);

SubCategorySchema.index({ reference: 1 }, { unique: true });

// Only seeded rows carry a `seedKey`, so the index is sparse: rows created by
// hand have none and must not collide with each other.
SubCategorySchema.index({ seedKey: 1 }, { unique: true, sparse: true });
