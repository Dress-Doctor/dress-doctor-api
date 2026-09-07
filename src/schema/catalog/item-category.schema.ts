import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Category } from './category.schema';
import { Item } from './item.schema';

export const itemCategorySchemaName = 'item_category';

@Schema({ timestamps: true, collection: itemCategorySchemaName })
export class ItemCategory extends Document<Types.ObjectId> {
  @Prop({ required: true, type: Types.ObjectId, ref: Item.name, index: true })
  itemId: Types.ObjectId;

  @Prop({
    index: true,
    required: true,
    ref: Category.name,
    type: Types.ObjectId,
  })
  categoryId: Types.ObjectId;
}

export const ItemCategorySchema = SchemaFactory.createForClass(ItemCategory);
ItemCategorySchema.index({ itemId: 1, categoryId: 1 }, { unique: true });
