import { Global, Module } from '@nestjs/common';
import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { attachHistoryHooks } from 'src/helper/mongoose-history.hook';
import { RewardLedger, RewardLedgerSchema } from './reward-ledger.schema';
import {
  RewardRuleHistory,
  RewardRuleHistorySchema,
} from './reward-rule-history.schema';
import { RewardRule, RewardRuleSchema } from './reward-rule.schema';
import {
  RewardTierHistory,
  RewardTierHistorySchema,
} from './reward-tier-history.schema';
import { RewardTier, RewardTierSchema } from './reward-tier.schema';

// Rules and tiers are admin-edited config → audited. The ledger is append-only
// by design (its rows ARE the audit trail), so it carries no history hooks.
@Global()
@Module({
  imports: [
    MongooseModule.forFeatureAsync([
      {
        name: RewardRule.name,
        inject: [getModelToken(RewardRuleHistory.name)],
        useFactory: (historyModel: Model<RewardRuleHistory>) =>
          attachHistoryHooks({
            schema: RewardRuleSchema,
            historyModel,
            idField: 'rewardRuleId',
            resourceName: RewardRule.name,
          }),
      },
      {
        name: RewardTier.name,
        inject: [getModelToken(RewardTierHistory.name)],
        useFactory: (historyModel: Model<RewardTierHistory>) =>
          attachHistoryHooks({
            schema: RewardTierSchema,
            historyModel,
            idField: 'rewardTierId',
            resourceName: RewardTier.name,
          }),
      },
    ]),
    MongooseModule.forFeature([
      { name: RewardLedger.name, schema: RewardLedgerSchema },
      { name: RewardRuleHistory.name, schema: RewardRuleHistorySchema },
      { name: RewardTierHistory.name, schema: RewardTierHistorySchema },
    ]),
  ],
  exports: [MongooseModule],
})
export class RewardSchemaModule {}
