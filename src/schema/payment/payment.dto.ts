export enum PaymentMethodEnum {
  CASH = 'Cash',
  MTN_MOMO = 'MTN Momo',
  ORANGE_MONEY = 'Orange Money',
}

export enum PaymentTypeEnum {
  PAYMENT = 'PAYMENT',
  REFUND = 'REFUND',
}

// AR-aging distinction preserved from the sheets: a payment either
// settles the current order balance or clears prior outstanding debt.
export enum DebtTypeEnum {
  CURRENT = 'Current',
  OLD_DEBT = 'Old Debt',
}
