export enum RewardRuleTypeEnum {
  ACCRUAL = 'ACCRUAL',
  MILESTONE = 'MILESTONE',
}

export enum RewardLedgerTypeEnum {
  EARN = 'EARN',
  REDEEM = 'REDEEM',
  ADJUST = 'ADJUST',
}

/** What a tier threshold is measured against (customer rollups). */
export enum RewardTierMetricEnum {
  SPEND = 'SPEND',
  ORDERS = 'ORDERS',
}

/**
 * Rule criteria shapes (stored as data, validated at write time):
 *  - ACCRUAL:   { per: 100, points: 1 }  → floor(totalAmount / per) × points
 *  - MILESTONE: { everyNthOrder: 5, points: 200 } → bonus on every Nth paid order
 */
export interface AccrualCriteria {
  per: number;
  points: number;
}

export interface MilestoneCriteria {
  everyNthOrder: number;
  points: number;
}
