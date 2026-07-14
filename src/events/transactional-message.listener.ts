import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Order } from 'src/schema/order/order.schema';
import { Customer } from 'src/schema/user/customer.schema';
import { User } from 'src/schema/user/user.schema';
import { Notification } from 'src/schema/notification/notification.schema';
import { NotificationService } from 'src/helper/service/notification.service';
import { maskPhone } from 'src/helper/pii';
import {
  LanguageEum,
  NotificationTemplateNameEnum,
} from 'src/schema/notification/notification.dto';
import { OTPChannelEnum } from 'src/schema/otp/otp.dto';
import { OrderStatusEnum } from 'src/schema/order/order.dto';
import { PreferredLanguageEnum } from 'src/schema/user/user.dto';
import {
  OrderEvents,
  type OrderStatusChangedEvent,
} from 'src/api/order/order.events';
import {
  PaymentEvents,
  type PaymentRecordedEvent,
} from 'src/api/payment/payment.events';

/**
 * Transactional customer messages (§2.5): order READY/DELIVERED and payment
 * receipts. Fired off domain events so the write path stays lean; everything
 * goes through the notification queue → delivery log.
 *
 * Idempotency — one message ever per (order,status) / (payment):
 * 1. `dedupKey` is the BullMQ jobId, so a duplicate event while the first job
 *    is queued/retained can't enqueue a second one.
 * 2. The delivery log's unique sparse `dedupKey` index + an exists-check here
 *    make it durable: once sent, a re-emitted event is a no-op forever.
 * Listener failures never break the emitting request — errors are logged.
 */
@Injectable()
export class TransactionalMessageListener {
  private readonly logger = new Logger(TransactionalMessageListener.name);

  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    @InjectModel(Customer.name)
    private readonly customerModel: Model<Customer>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<Notification>,
    private readonly notificationService: NotificationService,
  ) {}

  @OnEvent(OrderEvents.statusChanged)
  async onOrderStatusChanged(event: OrderStatusChangedEvent): Promise<void> {
    try {
      if (
        event.to !== OrderStatusEnum.READY &&
        event.to !== OrderStatusEnum.DELIVERED
      ) {
        return;
      }
      const order = await this.orderModel.findById(event.orderId).lean();
      if (!order) return;

      const template =
        event.to === OrderStatusEnum.READY
          ? NotificationTemplateNameEnum.ORDER_READY
          : NotificationTemplateNameEnum.ORDER_DELIVERED;

      await this.sendToCustomer({
        customerUserId: order.customerId,
        template,
        dedupKey: `order-status:${order._id.toString()}:${event.to}`,
        variables: { orderCode: order.orderCode },
      });
    } catch (err) {
      // Side effect only — never let a notification failure surface into the
      // status-transition request.
      this.logger.error(
        `order-status message failed for ${event.orderId.toString()}: ${(err as Error).message}`,
      );
    }
  }

  @OnEvent(PaymentEvents.recorded)
  async onPaymentRecorded(event: PaymentRecordedEvent): Promise<void> {
    try {
      // Receipts confirm money received; refunds are a staff-mediated flow.
      if (event.isRefund) return;

      const order = await this.orderModel.findById(event.orderId).lean();
      if (!order) return;

      await this.sendToCustomer({
        customerUserId: order.customerId,
        template: NotificationTemplateNameEnum.PAYMENT_RECEIPT,
        dedupKey: `payment-receipt:${event.paymentId.toString()}`,
        variables: {
          orderCode: order.orderCode,
          amount: `${event.amount} XAF`,
          balance: `${order.balanceDue} XAF`,
        },
      });
    } catch (err) {
      this.logger.error(
        `payment-receipt message failed for ${event.paymentId.toString()}: ${(err as Error).message}`,
      );
    }
  }

  /** Opt-in check → durable dedup check → channel pick → enqueue. */
  private async sendToCustomer(input: {
    customerUserId: Types.ObjectId;
    template: NotificationTemplateNameEnum;
    dedupKey: string;
    variables: Record<string, string>;
  }): Promise<void> {
    // Opt-in lives on the customer profile; missing profile = no send.
    const customer = await this.customerModel
      .findOne({ userId: input.customerUserId })
      .lean();
    if (!customer || !customer.notificationsOptIn) {
      this.logger.log(
        `skip ${input.dedupKey}: ${customer ? 'customer opted out' : 'no customer profile'}`,
      );
      return;
    }

    // Durable idempotency: already in the delivery log → sent once, never again.
    const already = await this.notificationModel.exists({
      dedupKey: input.dedupKey,
    });
    if (already) {
      this.logger.log(`skip ${input.dedupKey}: already sent`);
      return;
    }

    const user = await this.userModel.findById(input.customerUserId).lean();
    if (!user) return;

    // WhatsApp when we have a number; email otherwise; neither → skip.
    let channel: OTPChannelEnum;
    let address: string;
    if (user.whatsappPhone) {
      channel = OTPChannelEnum.WHATSAPP;
      address = user.whatsappPhone;
    } else if (user.email) {
      channel = OTPChannelEnum.EMAIL;
      address = user.email;
    } else {
      this.logger.warn(`skip ${input.dedupKey}: customer has no channel`);
      return;
    }

    const language =
      user.preferredLanguage === PreferredLanguageEnum.ENGLISH
        ? LanguageEum.EN
        : LanguageEum.FR;

    await this.notificationService.addToQueue({
      templateName: input.template,
      otpChannel: channel,
      language,
      dedupKey: input.dedupKey,
      recipients: [{ name: user.firstName ?? '', address }],
      variables: {
        firstName: user.firstName ?? '',
        year: String(new Date().getFullYear()),
        ...input.variables,
      },
    });

    this.logger.log(
      `queued ${input.template} (${input.dedupKey}) to ${maskPhone(address)} via ${channel}`,
    );
  }
}
