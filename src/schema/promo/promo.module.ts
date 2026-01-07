import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PromoCode, PromoCodeSchema } from './promo-code.schema';
import {
  PromoCodeHistory,
  PromoCodeHistorySchema,
} from './promo-code-history.schema';
import {
  PromoCodeUsage,
  PromoCodeUsageSchema,
} from './promo-code-usage.schema';
import {
  PromoCodeUsageHistory,
  PromoCodeUsageHistorySchema,
} from './promo-code-usage-history.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PromoCodeHistory.name, schema: PromoCodeHistorySchema },
      { name: PromoCodeUsageHistory.name, schema: PromoCodeUsageHistorySchema },
      { name: PromoCodeUsage.name, schema: PromoCodeUsageSchema },
      { name: PromoCode.name, schema: PromoCodeSchema },
    ]),
  ],
  exports: [MongooseModule],
})
export class PromoSchemaModule {}
