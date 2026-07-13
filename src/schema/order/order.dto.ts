export enum OrderStatusEnum {
  DRAFT = 'DRAFT',
  CONFIRMED = 'CONFIRMED',
  RECEIVED = 'RECEIVED',
  WASHING = 'WASHING',
  READY = 'READY',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}

export enum OrderPaymentStatusEnum {
  PAID = 'PAID',
  UNPAID = 'UNPAID',
  PARTIAL = 'PARTIAL',
  OVERPAID = 'OVERPAID',
}

/**
 * Server-side pricing model for an order (§6-8). Determines how subtotal is
 * computed; never client-supplied as a price, only as a mode selector.
 */
export enum PricingModelEnum {
  PER_PIECE = 'PER_PIECE',
  PER_KG = 'PER_KG',
  SUBSCRIPTION = 'SUBSCRIPTION',
  FREE = 'FREE',
}

export enum OrderItemConditionEnum {
  NORMAL = 'Normal',
  DIRTY = 'Dirty',
  VERY_DIRTY = 'Very Dirty',
  STAINED = 'Stained',
}
