import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, Document } from 'mongoose';

export const categorySchemaName = 'category';

@Schema({ timestamps: true, collection: categorySchemaName })
export class Category extends Document<Types.ObjectId> {
  // Human-readable identifier. Every single-row read and write of a category
  // is addressed by this, never by the mongo id.
  @Prop({ required: true })
  reference: string;

  @Prop({ required: true, unique: true })
  categoryName: string; // Men, Women, Children, Baby, Shoes, Household, Bag

  @Prop({ required: false })
  description?: string;

  @Prop({ required: true, default: true })
  isActive: boolean;
}

export const CategorySchema = SchemaFactory.createForClass(Category);

// Sparse, so the unique index can be built over rows written before
// `reference` existed. `npm run backfill:category-reference` fills those in.
CategorySchema.index({ reference: 1 }, { unique: true, sparse: true });
