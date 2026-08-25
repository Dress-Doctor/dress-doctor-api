export enum PaymentMethodEnum {
  CASH = 'Cash',
  MTN_MOMO = 'MTN Momo',
  ORANGE_MONEY = 'Orange Money',
}

export enum PaymentTypeEnum {
  PAYMENT = 'PAYMENT',
  REFUND = 'REFUND',
}

/**
 * AR-aging distinction preserved from the sheets: whether a payment lands in
 * the same accounting month as the order it settles (CURRENT) or clears a
 * balance carried over from an earlier month (PRIOR).
 *
 * Derived from the two dates, never supplied by the caller.
 */
export enum PaymentPeriodEnum {
  CURRENT = 'CURRENT',
  PRIOR = 'PRIOR',
}
