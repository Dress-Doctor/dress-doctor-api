import {
  OrderPaymentStatusEnum,
  OrderStatusEnum,
} from 'src/schema/order/order.dto';

// Single source of truth for the two computed order-money fields. Both the
// synchronous payment path (PaymentService) and the backstop reconcile
// (PaymentReconcileService) call these, so the two can never drift — the
// reconcile is guaranteed to agree with the live computation by construction.

/**
 * Order payment status from paid vs total (integer XAF):
 * UNPAID (≤0) · PARTIAL (0<paid<total) · PAID (==) · OVERPAID (>total).
 */
export function computePaymentStatus(
  amountPaid: number,
  total: number,
): OrderPaymentStatusEnum {
  if (amountPaid <= 0) return OrderPaymentStatusEnum.UNPAID;
  if (amountPaid < total) return OrderPaymentStatusEnum.PARTIAL;
  if (amountPaid === total) return OrderPaymentStatusEnum.PAID;
  return OrderPaymentStatusEnum.OVERPAID;
}

/**
 * flagged = status ∈ {READY, DELIVERED} and not fully PAID, or OVERPAID.
 * Computed, never hand-set.
 */
export function computeFlagged(
  statusName: string,
  paymentStatus: OrderPaymentStatusEnum,
): boolean {
  const readyOrDelivered =
    statusName === OrderStatusEnum.READY.toString() ||
    statusName === OrderStatusEnum.DELIVERED.toString();
  return (
    paymentStatus === OrderPaymentStatusEnum.OVERPAID ||
    (readyOrDelivered && paymentStatus !== OrderPaymentStatusEnum.PAID)
  );
}
