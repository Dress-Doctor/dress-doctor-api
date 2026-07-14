import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as crypto from 'crypto';
import { Model } from 'mongoose';
import { NotificationStatusEnum } from 'src/schema/notification/notification.dto';
import { Notification } from 'src/schema/notification/notification.schema';

// Minimal shape of the WhatsApp Cloud API status webhook payload.
interface WhatsAppStatus {
  id: string;
  status: string; // sent | delivered | read | failed
}
interface WhatsAppStatusPayload {
  entry?: {
    changes?: { value?: { statuses?: WhatsAppStatus[] } }[];
  }[];
}

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<Notification>,
  ) {}

  /**
   * Verify the WhatsApp X-Hub-Signature-256 header (HMAC-SHA256 of the raw body
   * with the app secret), constant-time. Rejects when unconfigured or mismatched.
   */
  verifySignature(rawBody: Buffer | undefined, signature?: string): void {
    const secret = process.env.WHATSAPP_APP_SECRET;
    if (!secret || !rawBody || !signature) {
      throw new ForbiddenException({
        code: 'INVALID_WEBHOOK_SIGNATURE',
        message: 'Invalid webhook signature',
      });
    }

    const expected =
      'sha256=' +
      crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw new ForbiddenException({
        code: 'INVALID_WEBHOOK_SIGNATURE',
        message: 'Invalid webhook signature',
      });
    }
  }

  /** Map a WhatsApp status to our enum + the timestamp field it sets. */
  private mapStatus(
    status: string,
  ): { status: NotificationStatusEnum; field?: string } | null {
    switch (status) {
      case 'delivered':
        return {
          status: NotificationStatusEnum.DELIVERED,
          field: 'deliveredAt',
        };
      case 'read':
        return { status: NotificationStatusEnum.READ, field: 'readAt' };
      case 'failed':
        return { status: NotificationStatusEnum.FAILED, field: 'failedAt' };
      default:
        return null; // 'sent' etc. — nothing to record
    }
  }

  /**
   * Idempotently apply delivery-status updates to the log by providerMessageId.
   * Re-delivering the same event is a no-op (setting the same status/timestamp).
   */
  async applyStatusUpdates(raw: unknown): Promise<number> {
    const payload = (raw ?? {}) as WhatsAppStatusPayload;
    const statuses =
      payload.entry?.flatMap(
        (e) => e.changes?.flatMap((c) => c.value?.statuses ?? []) ?? [],
      ) ?? [];

    let updated = 0;
    for (const s of statuses) {
      const mapped = this.mapStatus(s.status);
      if (!mapped || !s.id) continue;

      const set: Record<string, unknown> = { status: mapped.status };
      if (mapped.field) set[mapped.field] = new Date();

      const res = await this.notificationModel.updateOne(
        { providerMessageId: s.id },
        { $set: set },
      );
      updated += res.modifiedCount ?? 0;
    }

    this.logger.log(`whatsapp status webhook applied ${updated} update(s)`);
    return updated;
  }
}
