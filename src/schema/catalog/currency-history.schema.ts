import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { HistoryActionEnum } from '../admin/admin.dto';
import { ChangedFieldDto } from '../user/user.dto';
import { User } from '../user/user.schema';
import { Currency } from './currency.schema';

export const currencyHistorySchemaName = 'currency_history';

/**
 * The audit trail of one currency row — its name, symbol, decimal places and status.
 *
 * Catalogue rows decide what the business sells and at what price, so every
 * edit is recorded here and shown on the catalogue detail panel — what
 * changed, by whom and why.
 */
@Schema({ timestamps: true, collection: currencyHistorySchemaName })
export class CurrencyHistory extends Document<Types.ObjectId> {
  @Prop({
    index: true,
    required: true,
    type: Types.ObjectId,
    ref: Currency.name,
  })
  currencyId: Types.ObjectId;

  /**
   * Who made the change. Optional on the schema, like `reason` below: a
   * seed or a migration repair has no person behind it, and a history row
   * must never be rejected for a missing field or the entry is lost.
   */
  @Prop({ required: false, type: Types.ObjectId, ref: User.name })
  changedBy?: Types.ObjectId;

  @Prop({ required: false, type: Object, default: {} })
  changedFields?: Record<string, ChangedFieldDto>;

  @Prop({ required: true, type: String, enum: HistoryActionEnum })
  action: HistoryActionEnum;

  /**
   * Why the change was made, off the `x-change-reason` header every mutation
   * carries. Optional on the schema on purpose: a history row must never be
   * rejected for a missing field, or the audit entry is lost entirely.
   */
  @Prop({ required: false, trim: true, maxlength: 500 })
  reason?: string;

  @Prop({ required: false, type: Object, default: {} })
  snapshot?: Record<string, any>;
}

export const CurrencyHistorySchema =
  SchemaFactory.createForClass(CurrencyHistory);
