import {
  OrderPaymentStatusEnum,
  OrderStatusEnum,
} from 'src/schema/order/order.dto';
import { PaymentPeriodEnum } from 'src/schema/payment/payment.dto';

// Douala (WAT, UTC+1 year-round) is the business timezone — the same one the
// crons run on. Months are bucketed by it, not by UTC, so a payment taken at
// 00:30 on the 1st locally counts against the month the shop says it does.
const BUSINESS_TZ = 'Africa/Douala';

/** Year-month of an instant in the business timezone, as a sortable YYYY-MM. */
function businessMonth(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TZ,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);
  const year = parts.find((p) => p.type === 'year')?.value ?? '';
  const month = parts.find((p) => p.type === 'month')?.value ?? '';
  return `${year}-${month}`;
}

/**
 * PRIOR when the payment lands in a later business month than the order it
 * settles — money received this month against last month's order. CURRENT
 * otherwise, which includes the same month and the (clock-skew only) case of a
 * payment dated before its order: neither is a carried-over balance.
 */
export function computePaymentPeriod(
  paidAt: Date,
  orderDate: Date,
): PaymentPeriodEnum {
  return businessMonth(paidAt) > businessMonth(orderDate)
    ? PaymentPeriodEnum.PRIOR
    : PaymentPeriodEnum.CURRENT;
}

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
