import { Injectable, Logger, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { maskPhone } from '../pii';
import { ProviderMetricsService } from '../metrics/provider-metrics.service';

export const WHATSAPP_PROVIDER_NAME = 'whatsapp';

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

  // Optional so unit tests constructing the provider directly keep working;
  // in the app the global MetricsModule always provides it.
  constructor(
    @Optional() private readonly providerMetrics?: ProviderMetricsService,
  ) {}

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
      // Console fallback is not a real provider call — not recorded.
      return { providerMessageId, response: { console: true } };
    }

    const startedAt = Date.now();
    try {
      const result = await this.dispatch(apiUrl, token, phoneNumberId, params);
      await this.providerMetrics?.recordCall(
        WHATSAPP_PROVIDER_NAME,
        Date.now() - startedAt,
        true,
      );
      return result;
    } catch (err) {
      await this.providerMetrics?.recordCall(
        WHATSAPP_PROVIDER_NAME,
        Date.now() - startedAt,
        false,
      );
      throw err;
    }
  }

  private async dispatch(
    apiUrl: string,
    token: string,
    phoneNumberId: string,
    params: WhatsAppSendParams,
  ): Promise<WhatsAppSendResult> {
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
    /**
     * Read the body as text first, then try to parse it.
     *
     * A failing send is exactly when the body stops being JSON — a gateway
     * returns HTML, and some providers answer a plain `ERROR: ...` line.
     * Parsing before checking `res.ok` turned every one of those into
     * "Unexpected token 'E' ... is not valid JSON", which threw away both the
     * status and the provider's own reason, so the log never said why the
     * message did not go out.
     */
    const raw = await res.text();
    let json: WhatsAppApiResponse | undefined;
    try {
      json = JSON.parse(raw) as WhatsAppApiResponse;
    } catch {
      json = undefined;
    }

    if (!res.ok) {
      throw new Error(
        `WhatsApp send failed: ${res.status} ${raw.slice(0, 500)}`,
      );
    }

    if (!json) {
      throw new Error(
        `WhatsApp send returned a non-JSON body: ${res.status} ${raw.slice(0, 500)}`,
      );
    }

    this.logger.log(
      `WhatsApp sent to ${maskPhone(params.to)} template ${params.templateName}`,
    );
    return { providerMessageId: json.messages?.[0]?.id ?? '', response: json };
  }
}
