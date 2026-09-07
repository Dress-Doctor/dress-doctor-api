import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, Document } from 'mongoose';

export const subCategorySchemaName = 'sub_category';

@Schema({ timestamps: true, collection: subCategorySchemaName })
export class SubCategory extends Document<Types.ObjectId> {
  // Human-readable identifier. Every single-row read and write of a sub
  // category is addressed by this, never by the mongo id.
  @Prop({ required: true })
  reference: string;

  @Prop({ required: true, unique: true })
  subCategoryName: string; // Top, Dresses, Full Set, Bathroom

  @Prop({ required: false })
  description?: string;

  @Prop({ required: true, default: true })
  isActive: boolean;
}

export const SubCategorySchema = SchemaFactory.createForClass(SubCategory);

// Sparse, so the unique index can be built over rows written before
// `reference` existed. `npm run backfill:sub-category-reference` fills them in.
SubCategorySchema.index({ reference: 1 }, { unique: true, sparse: true });
