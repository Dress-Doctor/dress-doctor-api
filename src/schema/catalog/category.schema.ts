import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'category' })
export class Category extends Document<Types.ObjectId> {
  @Prop({ required: true, unique: true })
  categoryName: string; // Men, Women, Children, Baby, Shoes, Household, Bag

  @Prop({ required: false })
  description?: string;

  @Prop({ required: true, default: true })
  isActive: boolean;
}

export const CategorySchema = SchemaFactory.createForClass(Category);
