import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminSchemaModule } from './admin/admin.module';
import { AffiliateSchemaModule } from './affiliate/affiliate.module';
import { OfficeSchemaModule } from './office/office.module';
import { OrderSchemaModule } from './order/order.module';
import { PaymentSchemaModule } from './payment/payment.module';
import { PickupSchemaModule } from './pickup/pickup.module';
import { PromoSchemaModule } from './promo/promo.module';
import { UserSchemaModule } from './user/user.module';
import { OtpSchemaModule } from './otp/otp.module';
import { CatalogSchemaModule } from './catalog/catalog.module';

@Global()
@Module({
  imports: [
    MongooseModule.forRootAsync({
      useFactory: () => ({ uri: process.env.DATABASE_URL }),
    }),
    UserSchemaModule,
    OtpSchemaModule,
    OrderSchemaModule,
    AdminSchemaModule,
    PromoSchemaModule,
    OfficeSchemaModule,
    PickupSchemaModule,
    CatalogSchemaModule,
    PaymentSchemaModule,
    AffiliateSchemaModule,
  ],
  exports: [MongooseModule],
})
export class SchemaModule {}
