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

export enum OrderItemConditionEnum {
  NORMAL = 'Normal',
  DIRTY = 'Dirty',
  VERY_DIRTY = 'Very Dirty',
  STAINED = 'Stained',
}
