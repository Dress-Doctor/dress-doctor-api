export enum SubscriptionStatusEnum {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
}

export enum BillingCycleEnum {
  MONTHLY = 'MONTHLY',
  QUARTERLY = 'QUARTERLY',
}

export enum QuotaTypeEnum {
  PIECES = 'PIECES',
  WEIGHT_KG = 'WEIGHT_KG',
}

/**
 * How usage beyond the remaining quota is charged. PER_UNIT (the default):
 * each excess unit is billed at the standard rate — pay-per-piece catalog
 * price for PIECES plans, the overageRate setting for WEIGHT_KG plans.
 * Extensible as data for future policies.
 */
export enum OveragePolicyEnum {
  PER_UNIT = 'PER_UNIT',
}
