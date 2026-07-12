import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Currency } from './currency.schema';
import { Item } from './item.schema';
import { Office } from '../office/office.schema';
import { ServiceType } from './service-type.schema';

export const priceSchemaName = 'price';

/**
 * A resolved unit price for an (item, serviceType) at an office. `officeId: null`
 * is the company-wide default; a per-office row overrides it. Price changes are
 * append-only (a new effectiveFrom row; older rows deactivated), which is the
 * schema's own audit trail — hence no separate *-history hook.
 */
@Schema({ timestamps: true, collection: priceSchemaName })
export class Price extends Document<Types.ObjectId> {
  @Prop({ required: true, type: Types.ObjectId, ref: Item.name })
  itemId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: ServiceType.name })
  serviceTypeId: Types.ObjectId;

  // null = company-wide default; set = per-office override.
  @Prop({
    required: false,
    default: null,
    type: Types.ObjectId,
    ref: Office.name,
  })
  officeId: Types.ObjectId | null;

  @Prop({ required: true }) // integer XAF
  unitPrice: number;

  @Prop({ required: true, type: Types.ObjectId, ref: Currency.name })
  currencyId: Types.ObjectId;

  @Prop({ required: true, default: () => new Date() })
  effectiveFrom: Date;

  @Prop({ required: true, default: true })
  isActive: boolean;
}

export const PriceSchema = SchemaFactory.createForClass(Price);
PriceSchema.index({ itemId: 1, serviceTypeId: 1, officeId: 1 });
PriceSchema.index({ isActive: 1, effectiveFrom: -1 });
