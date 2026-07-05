import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Currency } from './currency.schema';
import { ServiceType } from './service-type.schema';
import { Service } from './service.schema';

@Schema({ timestamps: true, collection: 'item' })
export class Item extends Document<Types.ObjectId> {
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
