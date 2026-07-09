import { Prop } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { User } from 'src/schema/user/user.schema';

// Subclasses still need their own @Schema({ timestamps: true }) — that
// decorator only applies to the class it's placed on, not inherited.
export abstract class BaseSchema extends Document<Types.ObjectId> {
  @Prop({ required: true, default: true })
  isActive: boolean;

  @Prop({ type: Types.ObjectId, ref: User.name })
  createdBy?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: User.name })
  updatedBy?: Types.ObjectId;
}
