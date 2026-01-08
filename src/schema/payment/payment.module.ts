import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PaymentHistory, PaymentHistorySchema } from './payment-history.schema';
import { PaymentMethod, PaymentMethodSchema } from './payment-method.schema';
import { PaymentStatus, PaymentStatusSchema } from './payment-status.schema';
import { Payment, PaymentSchema } from './payment.schema';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Payment.name, schema: PaymentSchema },
      { name: PaymentMethod.name, schema: PaymentMethodSchema },
      { name: PaymentStatus.name, schema: PaymentStatusSchema },
      { name: PaymentHistory.name, schema: PaymentHistorySchema },
    ]),
  ],
  exports: [MongooseModule],
})
export class PaymentSchemaModule {}
