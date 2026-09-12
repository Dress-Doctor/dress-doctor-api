import { PaymentPeriodEnum } from 'src/schema/payment/payment.dto';
import { computePaymentPeriod } from './payment-status.util';

describe('computePaymentPeriod', () => {
  const { CURRENT, PRIOR } = PaymentPeriodEnum;

  it('is CURRENT when the payment settles an order from the same month', () => {
    const period = computePaymentPeriod(
      new Date('2026-08-22T10:00:00Z'),
      new Date('2026-08-03T09:00:00Z'),
    );
    expect(period).toBe(CURRENT);
  });

  it('is PRIOR when the payment settles last month’s order', () => {
    const period = computePaymentPeriod(
      new Date('2026-08-02T10:00:00Z'),
      new Date('2026-07-29T09:00:00Z'),
    );
    expect(period).toBe(PRIOR);
  });

  it('is PRIOR across a year boundary', () => {
    const period = computePaymentPeriod(
      new Date('2026-01-04T10:00:00Z'),
      new Date('2025-12-30T09:00:00Z'),
    );
    expect(period).toBe(PRIOR);
  });

  // Douala is UTC+1, so this instant is already the 1st locally: it belongs to
  // the new month, and the order it settles is therefore last month's.
  it('buckets by the business timezone, not UTC', () => {
    const paidAt = new Date('2026-07-31T23:30:00Z'); // 2026-08-01 00:30 WAT
    expect(computePaymentPeriod(paidAt, new Date('2026-07-10T09:00:00Z'))).toBe(
      PRIOR,
    );
    expect(computePaymentPeriod(paidAt, new Date('2026-08-01T09:00:00Z'))).toBe(
      CURRENT,
    );
  });

  // Clock skew only — a payment dated before its order is not a carried-over
  // balance, so it must not be labelled PRIOR.
  it('is CURRENT when the payment predates the order', () => {
    const period = computePaymentPeriod(
      new Date('2026-07-30T10:00:00Z'),
      new Date('2026-08-01T09:00:00Z'),
    );
    expect(period).toBe(CURRENT);
  });
});
