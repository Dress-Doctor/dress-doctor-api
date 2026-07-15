import { Global, Module } from '@nestjs/common';
import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { attachHistoryHooks } from 'src/helper/mongoose-history.hook';
import {
  SubscriptionHistory,
  SubscriptionHistorySchema,
} from './subscription-history.schema';
import {
  SubscriptionPlanHistory,
  SubscriptionPlanHistorySchema,
} from './subscription-plan-history.schema';
import {
  SubscriptionPlan,
  SubscriptionPlanSchema,
} from './subscription-plan.schema';
import { Subscription, SubscriptionSchema } from './subscription.schema';

// Subscriptions + plans are mutating domain config → audited (§2 blueprint).
@Global()
@Module({
  imports: [
    MongooseModule.forFeatureAsync([
      {
        name: Subscription.name,
        inject: [getModelToken(SubscriptionHistory.name)],
        useFactory: (historyModel: Model<SubscriptionHistory>) =>
          attachHistoryHooks({
            schema: SubscriptionSchema,
            historyModel,
            idField: 'subscriptionId',
            resourceName: Subscription.name,
          }),
      },
      {
        name: SubscriptionPlan.name,
        inject: [getModelToken(SubscriptionPlanHistory.name)],
        useFactory: (historyModel: Model<SubscriptionPlanHistory>) =>
          attachHistoryHooks({
            schema: SubscriptionPlanSchema,
            historyModel,
            idField: 'subscriptionPlanId',
            resourceName: SubscriptionPlan.name,
          }),
      },
    ]),
    MongooseModule.forFeature([
      { name: SubscriptionHistory.name, schema: SubscriptionHistorySchema },
      {
        name: SubscriptionPlanHistory.name,
        schema: SubscriptionPlanHistorySchema,
      },
    ]),
  ],
  exports: [MongooseModule],
})
export class SubscriptionSchemaModule {}
