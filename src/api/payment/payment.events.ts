import { Types } from 'mongoose';

/** Domain events for payments. Listeners land in Phase 2 (notifications/receipts). */
export const PaymentEvents = {
  recorded: 'payment.recorded',
} as const;

export interface PaymentRecordedEvent {
  paymentId: Types.ObjectId;
  orderId: Types.ObjectId;
  amount: number;
  isRefund: boolean;
}
