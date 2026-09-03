import { Global, Module } from '@nestjs/common';
import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { PaymentHistory, PaymentHistorySchema } from './payment-history.schema';
import {
  PaymentMethodHistory,
  PaymentMethodHistorySchema,
} from './payment-method-history.schema';
import { PaymentMethod, PaymentMethodSchema } from './payment-method.schema';
import {
  PaymentTypeHistory,
  PaymentTypeHistorySchema,
} from './payment-type-history.schema';
import { PaymentType, PaymentTypeSchema } from './payment-type.schema';
import { Payment, PaymentSchema } from './payment.schema';
import { Model } from 'mongoose';
import { attachHistoryHooks } from 'src/helper/mongoose-history.hook';

@Global()
@Module({
  imports: [
    MongooseModule.forFeatureAsync([
      {
        name: Payment.name,
        inject: [getModelToken(PaymentHistory.name)],
        useFactory: (historyModel: Model<PaymentHistory>) => {
          const schema = PaymentSchema;
          return attachHistoryHooks({
            schema,
            historyModel,
            idField: 'paymentId',
            resourceName: Payment.name,
          });
        },
      },

      // Reference data, but editable from the reference screen now, so their
      // edits are recorded like any other domain write.
      {
        name: PaymentMethod.name,
        inject: [getModelToken(PaymentMethodHistory.name)],
        useFactory: (historyModel: Model<PaymentMethodHistory>) =>
          attachHistoryHooks({
            historyModel,
            idField: 'paymentMethodId',
            schema: PaymentMethodSchema,
            resourceName: PaymentMethod.name,
          }),
      },
      {
        name: PaymentType.name,
        inject: [getModelToken(PaymentTypeHistory.name)],
        useFactory: (historyModel: Model<PaymentTypeHistory>) =>
          attachHistoryHooks({
            historyModel,
            idField: 'paymentTypeId',
            schema: PaymentTypeSchema,
            resourceName: PaymentType.name,
          }),
      },
    ]),
    MongooseModule.forFeature([
      { name: PaymentHistory.name, schema: PaymentHistorySchema },
      { name: PaymentMethodHistory.name, schema: PaymentMethodHistorySchema },
      { name: PaymentTypeHistory.name, schema: PaymentTypeHistorySchema },
    ]),
  ],
  exports: [MongooseModule],
})
export class PaymentSchemaModule {}
