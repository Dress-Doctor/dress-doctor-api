import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  CustomerHistory,
  CustomerHistorySchema,
} from './customer-history.schema';
import { Customer, CustomerSchema } from './customer.schema';
import { OtpCode, OtpCodeSchema } from './otp-code.schema';
import { Referral, ReferralSchema } from './referral.schema';
import { UserHistory, UserHistorySchema } from './user-history.schema';
import { UserType, UserTypeSchema } from './user-type.schema';
import { User, UserSchema } from './user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: OtpCode.name, schema: OtpCodeSchema },
      { name: UserType.name, schema: UserTypeSchema },
      { name: Customer.name, schema: CustomerSchema },
      { name: Referral.name, schema: ReferralSchema },
      { name: UserHistory.name, schema: UserHistorySchema },
      { name: CustomerHistory.name, schema: CustomerHistorySchema },
    ]),
  ],
  exports: [MongooseModule],
})
export class UserSchemaModule {}
