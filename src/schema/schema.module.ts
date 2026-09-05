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
import { NotificationSchemaModule } from './notification/notification.module';
import { SettingsSchemaModule } from './settings/settings.module';
import { SubscriptionSchemaModule } from './subscription/subscription.module';
import { JobRunSchemaModule } from './job-run/job-run.module';
import { FollowUpSchemaModule } from './follow-up/follow-up.module';
import { RewardSchemaModule } from './reward/reward.module';
import { ActivitySchemaModule } from './activity/activity.module';

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
    SettingsSchemaModule,
    AffiliateSchemaModule,
    NotificationSchemaModule,
    SubscriptionSchemaModule,
    JobRunSchemaModule,
    FollowUpSchemaModule,
    RewardSchemaModule,
    ActivitySchemaModule,
  ],
  exports: [MongooseModule],
})
export class SchemaModule {}
