import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Order } from 'src/schema/order/order.schema';
import { OrderStatus } from 'src/schema/order/order-status.schema';
import { Payment } from 'src/schema/payment/payment.schema';
import { computePaymentStatus, computeFlagged } from './payment-status.util';

// If the cron has no watermark yet (first run), bound the scan to a recent
// window rather than every order ever.
const DEFAULT_WINDOW_MS = 20 * 60 * 1000;

/**
 * Backstop for the computed order-money flags. Recomputes paymentStatus/flagged
 * for orders whose payments changed since the watermark and corrects any that
 * drifted from the synchronous path. Because it recomputes through the SAME
 * `payment-status.util` functions PaymentService uses, a converged order is a
 * no-op — the reconcile can only agree with the live computation, never invent
 * a different answer. Idempotent: a second run over the same window changes
 * nothing.
 */
@Injectable()
export class PaymentReconcileService {
  private readonly logger = new Logger(PaymentReconcileService.name);

  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    @InjectModel(Payment.name) private readonly paymentModel: Model<Payment>,
  ) {}

  async run(since?: Date): Promise<Record<string, number>> {
    const windowStart = since ?? new Date(Date.now() - DEFAULT_WINDOW_MS);

    const orderIds: Types.ObjectId[] = await this.paymentModel.distinct(
      'orderId',
      { updatedAt: { $gte: windowStart } },
    );

    let scanned = 0;
    let changed = 0;

    for (const orderId of orderIds) {
      const order = await this.orderModel
        .findById(orderId)
        .populate<{ orderStatusId: OrderStatus }>({
          model: OrderStatus.name,
          path: 'orderStatusId',
        });
      if (!order) continue;
      scanned++;

      const statusName = order.orderStatusId?.orderStatusName ?? '';
      const paymentStatus = computePaymentStatus(
        order.amountPaid,
        order.totalAmount,
      );
      const flagged = computeFlagged(statusName, paymentStatus);

      if (order.paymentStatus === paymentStatus && order.flagged === flagged) {
        continue; // already agrees with the synchronous computation
      }

      await this.orderModel.updateOne(
        { _id: order._id },
        { $set: { paymentStatus, flagged } },
      );
      changed++;
      this.logger.warn(
        `reconcile corrected order ${order._id.toString()}: ` +
          `paymentStatus ${order.paymentStatus}->${paymentStatus}, ` +
          `flagged ${order.flagged}->${flagged}`,
      );
    }

    return { scanned, changed };
  }
}
