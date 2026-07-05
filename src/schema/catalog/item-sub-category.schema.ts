import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Item } from './item.schema';
import { SubCategory } from './sub-category.schema';

@Schema({ timestamps: true, collection: 'item_sub_category' })
export class ItemSubCategory extends Document<Types.ObjectId> {
  @Prop({ required: true, type: Types.ObjectId, ref: Item.name, index: true })
  itemId: Types.ObjectId;

  @Prop({
    index: true,
    required: true,
    type: Types.ObjectId,
    ref: SubCategory.name,
  })
  subCategoryId: Types.ObjectId;
}

export const ItemSubCategorySchema =
  SchemaFactory.createForClass(ItemSubCategory);
ItemSubCategorySchema.index({ itemId: 1, subCategoryId: 1 }, { unique: true });
