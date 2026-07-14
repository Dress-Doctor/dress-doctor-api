import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { maskPhone } from '../pii';

export interface WhatsAppSendParams {
  to: string; // E.164 recipient
  templateName: string; // approved WhatsApp template name
  language: string; // e.g. 'fr' | 'en'
  variables: Record<string, string>;
}

export interface WhatsAppSendResult {
  providerMessageId: string;
  response: unknown;
}

interface WhatsAppApiResponse {
  messages?: { id: string }[];
}

/**
 * WhatsApp Business Cloud API sender. Injectable so it can be mocked in tests.
 * When credentials aren't configured (dev/CI) it logs + returns a synthetic id
 * so the send path + delivery log work without live credentials.
 */
@Injectable()
export class WhatsAppProvider {
  private readonly logger = new Logger(WhatsAppProvider.name);

  async send(params: WhatsAppSendParams): Promise<WhatsAppSendResult> {
    const apiUrl = process.env.WHATSAPP_API_URL;
    const token = process.env.WHATSAPP_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER;

    if (!apiUrl || !token || !phoneNumberId) {
      const providerMessageId = `dev-${randomUUID()}`;
      this.logger.warn(
        `WhatsApp not configured — console send to ${maskPhone(params.to)} ` +
          `template ${params.templateName} (${providerMessageId})`,
      );
      return { providerMessageId, response: { console: true } };
    }

    const body = {
      messaging_product: 'whatsapp',
      to: params.to,
      type: 'template',
      template: {
        name: params.templateName,
        language: { code: params.language },
        components: [
          {
            type: 'body',
            parameters: Object.values(params.variables).map((text) => ({
              type: 'text',
              text,
            })),
          },
        ],
      },
    };

    const res = await fetch(`${apiUrl}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as WhatsAppApiResponse;

    if (!res.ok) {
      throw new Error(
        `WhatsApp send failed: ${res.status} ${JSON.stringify(json)}`,
      );
    }

    this.logger.log(
      `WhatsApp sent to ${maskPhone(params.to)} template ${params.templateName}`,
    );
    return { providerMessageId: json.messages?.[0]?.id ?? '', response: json };
  }
}
