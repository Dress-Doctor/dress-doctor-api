import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'sub_category' })
export class SubCategory extends Document<Types.ObjectId> {
  @Prop({ required: true, unique: true })
  subCategoryName: string; // Top, Dresses, Full Set, Bathroom

  @Prop({ required: false })
  description?: string;

  @Prop({ required: true, default: true })
  isActive: boolean;
}

export const SubCategorySchema = SchemaFactory.createForClass(SubCategory);
