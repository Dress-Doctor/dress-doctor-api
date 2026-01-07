import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  AffiliatePartner,
  AffiliatePartnerSchema,
} from './affiliate-partner.schema';
import {
  AffiliatePartnerBalanceHistory,
  AffiliatePartnerBalanceHistorySchema,
} from './affiliate-partner-balance-history.schema';
import {
  AffiliatePartnerHistory,
  AffiliatePartnerHistorySchema,
} from './affiliate-partner-history.schema';
import {
  AffiliateTransaction,
  AffiliateTransactionSchema,
} from './affiliate-transaction.schema';
import {
  AffiliateTransactionHistory,
  AffiliateTransactionHistorySchema,
} from './affiliate-transaction-history.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: AffiliatePartnerBalanceHistory.name,
        schema: AffiliatePartnerBalanceHistorySchema,
      },
      {
        name: AffiliatePartnerHistory.name,
        schema: AffiliatePartnerHistorySchema,
      },
      { name: AffiliatePartner.name, schema: AffiliatePartnerSchema },
      { name: AffiliateTransaction.name, schema: AffiliateTransactionSchema },
      {
        name: AffiliateTransactionHistory.name,
        schema: AffiliateTransactionHistorySchema,
      },
    ]),
  ],
  exports: [MongooseModule],
})
export class AffiliateSchemaModule {}
