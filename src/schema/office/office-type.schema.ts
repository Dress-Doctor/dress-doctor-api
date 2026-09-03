import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export const officeTypeSchemaName = 'office_type';
@Schema({ timestamps: true, collection: officeTypeSchemaName })
export class OfficeType extends Document<Types.ObjectId> {
  // Human-readable identifier, the same idea as an order status's `reference`
  // or a user type's: it is what a URL, a table row and a support conversation
  // quote, so nobody has to pass a 24-character mongo id around.
  @Prop({ required: true })
  reference: string;

  /**
   * The name the rest of the platform matches on.
   *
   * NOT a display label. Two places match the two seeded rows by this literal:
   *
   *  - `api-client.guard.ts` finds the FACTORY row by name to pick a default
   *    office when no `office_ref` cookie is present, and dereferences the
   *    result without a null check — a rename turns that into a runtime
   *    TypeError.
   *  - `office.service.ts` resolves the office list's `officeTypeName` filter
   *    by name, and `find-office.dto.ts` validates it against
   *    `OfficeTypeEnum`.
   *
   * Which is why the API's update DTO does not accept this field.
   */
  @Prop({ required: true, unique: true })
  officeTypeName: string; // FACTOR OR OFFICE

  @Prop({ required: false })
  description?: string;

  @Prop({ required: true, default: true })
  isActive: boolean;
}

export const OfficeTypeSchema = SchemaFactory.createForClass(OfficeType);

// Sparse, so the unique index can be built over rows written before
// `reference` existed. `npm run backfill:office-type-reference` fills those in.
OfficeTypeSchema.index({ reference: 1 }, { unique: true, sparse: true });
