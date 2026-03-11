import { Global, Module } from '@nestjs/common';
import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { PaymentHistory, PaymentHistorySchema } from './payment-history.schema';
import { PaymentMethod, PaymentMethodSchema } from './payment-method.schema';
import { PaymentStatus, PaymentStatusSchema } from './payment-status.schema';
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
    ]),
    MongooseModule.forFeature([
      { name: PaymentMethod.name, schema: PaymentMethodSchema },
      { name: PaymentStatus.name, schema: PaymentStatusSchema },
      { name: PaymentHistory.name, schema: PaymentHistorySchema },
    ]),
  ],
  exports: [MongooseModule],
})
export class PaymentSchemaModule {}
