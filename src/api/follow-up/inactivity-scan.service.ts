import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Customer } from 'src/schema/user/customer.schema';
import { User } from 'src/schema/user/user.schema';
import { Order } from 'src/schema/order/order.schema';
import { OrderItem } from 'src/schema/order/order-item.schema';
import { Item } from 'src/schema/catalog/item.schema';
import { FollowUp } from 'src/schema/follow-up/follow-up.schema';
import { Setting, SettingKeys } from 'src/schema/settings/settings.schema';
import { NotificationService } from 'src/helper/service/notification.service';
import { maskPhone } from 'src/helper/pii';
import {
  LanguageEum,
  NotificationTemplateNameEnum,
} from 'src/schema/notification/notification.dto';
import { OTPChannelEnum } from 'src/schema/otp/otp.dto';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_INACTIVE_DAYS = 14;
const DEFAULT_COOLDOWN_DAYS = 7;

/**
 * The nightly inactivity scan (§2.4). For each customer whose lastOrderAt is
 * older than the inactivity threshold and who has no active cooldown, write a
 * follow-up row and enqueue a WhatsApp alert to Customer Service carrying the
 * full context (name, phone, last order date/items/value, lifetime orders) so
 * CS can call without opening anything.
 *
 * Idempotency: the follow-up row is written BEFORE the alert is enqueued, and
 * an unresolved row with a future cooldownUntil blocks re-alerting — so a
 * mid-run retry skips every customer already processed in the same pass, and
 * tomorrow's scan skips them until the cooldown lapses. Resolving clears the
 * block. Never-ordered customers are excluded: they appear in the inactive
 * list route, but there is no "last order" context to act on.
 */
@Injectable()
export class InactivityScanService {
  private readonly logger = new Logger(InactivityScanService.name);

  constructor(
    @InjectModel(Customer.name) private readonly customerModel: Model<Customer>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    @InjectModel(OrderItem.name)
    private readonly orderItemModel: Model<OrderItem>,
    @InjectModel(FollowUp.name) private readonly followUpModel: Model<FollowUp>,
    @InjectModel(Setting.name) private readonly settingModel: Model<Setting>,
    private readonly notificationService: NotificationService,
  ) {}

  private async settingValue(key: string, fallback: number): Promise<number> {
    const row = await this.settingModel.findOne({ key, officeId: null }).lean();
    return row?.value ?? fallback;
  }

  async run(): Promise<Record<string, number>> {
    const now = new Date();
    const inactiveDays = await this.settingValue(
      SettingKeys.inactiveDays,
      DEFAULT_INACTIVE_DAYS,
    );
    const cooldownDays = await this.settingValue(
      SettingKeys.followUpCooldownDays,
      DEFAULT_COOLDOWN_DAYS,
    );
    const threshold = new Date(now.getTime() - inactiveDays * DAY_MS);
    const csPhone = process.env.CS_WHATSAPP_PHONE;

    const candidates = await this.customerModel
      .find({ lastOrderAt: { $lte: threshold } })
      .lean();

    // One query for every candidate's active (unresolved, cooling-down)
    // follow-up instead of a lookup per customer.
    const blockedIds = new Set(
      (
        await this.followUpModel.distinct('customerId', {
          customerId: { $in: candidates.map((c) => c._id) },
          resolvedAt: null,
          cooldownUntil: { $gt: now },
        })
      ).map((id: Types.ObjectId) => id.toString()),
    );

    let alerted = 0;
    let skippedCooldown = 0;
    let skippedNoDestination = 0;

    for (const customer of candidates) {
      if (blockedIds.has(customer._id.toString())) {
        skippedCooldown++;
        continue;
      }
      if (!csPhone) {
        // No destination configured: count it, don't write a follow-up — a
        // cooldown row without an actual alert would silence future alerts.
        skippedNoDestination++;
        continue;
      }

      await this.alert(customer, now, cooldownDays);
      alerted++;
    }

    if (skippedNoDestination > 0) {
      this.logger.warn(
        `CS_WHATSAPP_PHONE not configured — ${skippedNoDestination} inactivity alert(s) skipped`,
      );
    }

    return {
      scanned: candidates.length,
      alerted,
      skippedCooldown,
      skippedNoDestination,
    };
  }

  /** Write the follow-up (idempotency anchor), then enqueue the CS alert. */
  private async alert(
    customer: Pick<Customer, '_id' | 'userId' | 'lastOrderAt' | 'totalOrders'>,
    now: Date,
    cooldownDays: number,
  ): Promise<void> {
    const followUp = await this.followUpModel.create({
      customerId: customer._id,
      triggeredAt: now,
      lastOrderAt: customer.lastOrderAt,
      cooldownUntil: new Date(now.getTime() + cooldownDays * DAY_MS),
    });

    const user = await this.userModel.findById(customer.userId).lean();
    const lastOrder = await this.orderModel
      .findOne({ customerId: customer.userId })
      .sort({ createdAt: -1 })
      .lean();

    let lastOrderItems = '—';
    if (lastOrder) {
      const items = await this.orderItemModel
        .find({ orderId: lastOrder._id })
        .populate<{ itemId: Item }>({ model: Item.name, path: 'itemId' })
        .lean();
      if (items.length > 0) {
        lastOrderItems = items
          .map((i) => `${i.quantity}× ${i.itemId?.itemName ?? '?'}`)
          .join(', ');
      }
    }

    const customerName =
      [user?.firstName, user?.lastName].filter(Boolean).join(' ') || '—';
    // The alert body legitimately carries the raw phone — CS needs it to call.
    // Logs never do (the notification path logs variable keys only).
    const customerPhone = user?.whatsappPhone || user?.phone || '—';

    await this.notificationService.addToQueue({
      templateName: NotificationTemplateNameEnum.INACTIVE_CUSTOMER_ALERT,
      otpChannel: OTPChannelEnum.WHATSAPP,
      language: LanguageEum.FR,
      recipients: [
        { name: 'Customer Service', address: process.env.CS_WHATSAPP_PHONE! },
      ],
      followUpId: followUp._id.toString(),
      variables: {
        customerName,
        customerPhone,
        lastOrderDate: customer.lastOrderAt?.toISOString().slice(0, 10) ?? '—',
        lastOrderItems,
        lastOrderValue: lastOrder ? `${lastOrder.totalAmount} XAF` : '—',
        totalOrders: String(customer.totalOrders ?? 0),
      },
    });

    this.logger.log(
      `Inactivity alert queued for customer ${customer._id.toString()} ` +
        `(${maskPhone(customerPhone)}), follow-up ${followUp._id.toString()}`,
    );
  }
}
