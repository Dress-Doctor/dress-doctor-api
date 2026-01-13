import { Global, Module } from '@nestjs/common';
import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { attachHistoryHooks } from 'src/helper/mongoose-history.hook';
import {
  CustomerHistory,
  CustomerHistorySchema,
} from './customer-history.schema';
import { Customer, CustomerSchema } from './customer.schema';
import { Referral, ReferralSchema } from './referral.schema';
import { UserHistory, UserHistorySchema } from './user-history.schema';
import { UserType, UserTypeSchema } from './user-type.schema';
import { User, UserSchema } from './user.schema';

@Global()
@Module({
  imports: [
    MongooseModule.forFeatureAsync([
      {
        name: User.name,
        inject: [getModelToken(UserHistory.name)],
        useFactory: (historyModel: Model<UserHistory>) => {
          const schema = UserSchema;

          return attachHistoryHooks({
            schema,
            historyModel,
            idField: 'userId',
            resourceName: User.name,
          });
        },
      },

      {
        name: Customer.name,
        inject: [getModelToken(CustomerHistory.name)],
        useFactory: (historyModel: Model<CustomerHistory>) => {
          const schema = CustomerSchema;
          return attachHistoryHooks({
            schema,
            historyModel,
            idField: 'customerId',
            resourceName: Customer.name,
          });
        },
      },
    ]),
    MongooseModule.forFeature([
      { name: UserType.name, schema: UserTypeSchema },
      { name: Referral.name, schema: ReferralSchema },
      { name: UserHistory.name, schema: UserHistorySchema },
      { name: CustomerHistory.name, schema: CustomerHistorySchema },
    ]),
  ],
  exports: [MongooseModule],
})
export class UserSchemaModule {}
