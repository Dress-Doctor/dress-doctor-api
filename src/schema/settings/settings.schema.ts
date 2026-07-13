import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Office } from '../office/office.schema';

export const settingSchemaName = 'settings';

/**
 * Operational config as data (not constants): rates, thresholds, toggles.
 * A global row has officeId: null; a per-office row overrides it. Values are
 * numeric here (rates/thresholds) — richer settings can extend this later.
 */
@Schema({ timestamps: true, collection: settingSchemaName })
export class Setting extends Document<Types.ObjectId> {
  @Prop({ required: true })
  key: string;

  @Prop({ required: true })
  value: number;

  @Prop({ required: false })
  description?: string;

  // null = global default; set = per-office override.
  @Prop({
    required: false,
    default: null,
    type: Types.ObjectId,
    ref: Office.name,
  })
  officeId: Types.ObjectId | null;
}

export const SettingSchema = SchemaFactory.createForClass(Setting);
SettingSchema.index({ key: 1, officeId: 1 }, { unique: true });

/** Canonical setting keys. */
export const SettingKeys = {
  perKgRate: 'perKgRate',
  overageRate: 'overageRate',
  inactiveDays: 'inactiveDays',
} as const;
