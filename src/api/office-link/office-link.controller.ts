import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Query,
  Res,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiFoundResponse } from '@nestjs/swagger';
import { type Response } from 'express';
import { OfficeLinkService } from './office-link.service';
import { Public } from 'src/helper/decorator/public.decorator';
import { SkipApiKeyCheck } from 'src/helper/decorator/skip-api-key.decorator';

@Controller({ path: 'o', version: VERSION_NEUTRAL })
export class OfficeLinkController {
  constructor(
    private readonly officeLinkService: OfficeLinkService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Get(':slug')
  @SkipApiKeyCheck()
  @HttpCode(HttpStatus.FOUND)
  @ApiFoundResponse({
    description: 'The user will be redirected (HTTP 302 Found).',
  })
  async trackOffice(
    @Res() res: Response,
    @Query('sig') sig: string,
    @Query('exp') exp: string,
    @Param('slug') slug: string,
  ) {
    const office = await this.officeLinkService.validateOfficeLink(
      slug,
      sig,
      exp,
    );

    const isProd = this.config.get<string>('NODE_ENV') === 'production';

    // Attribution cookie — domain + secure are env-driven so it works in prod
    // (an empty COOKIE_DOMAIN lets the browser default to the request host).
    res.cookie('office_ref', office?._id.toString(), {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd,
      domain: this.config.get<string>('COOKIE_DOMAIN') || undefined,
      maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
    });

    res.redirect(this.config.get<string>('DD_WEB_URL', ''));
  }
}
