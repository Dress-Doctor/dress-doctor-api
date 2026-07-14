import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { type RawBodyRequest } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { type Request, type Response } from 'express';
import { Public } from 'src/helper/decorator/public.decorator';
import { SkipApiKeyCheck } from 'src/helper/decorator/skip-api-key.decorator';
import { WebhookService } from './webhook.service';

@Controller('webhooks/whatsapp')
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  // WhatsApp webhook verification handshake — must echo hub.challenge raw, so it
  // bypasses the response envelope via @Res.
  @Public()
  @Get('status')
  @SkipApiKeyCheck()
  @ApiOperation({ summary: 'WhatsApp webhook verification challenge' })
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      res.status(HttpStatus.OK).send(challenge);
      return;
    }
    res.status(HttpStatus.FORBIDDEN).send('Forbidden');
  }

  @Public()
  @Post('status')
  @SkipApiKeyCheck()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'WhatsApp delivery-status webhook (signed)' })
  async status(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') signature: string,
    @Body() payload: unknown,
  ) {
    this.webhookService.verifySignature(req.rawBody, signature);
    const updated = await this.webhookService.applyStatusUpdates(payload);
    return { received: true, updated };
  }
}
