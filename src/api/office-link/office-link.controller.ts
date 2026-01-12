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
import { ApiFoundResponse } from '@nestjs/swagger';
import { type Response } from 'express';
import { OfficeLinkService } from './office-link.service';
import { Public } from 'src/helper/decorator/public.decorator';

@Controller({ path: 'o', version: VERSION_NEUTRAL })
export class OfficeLinkController {
  constructor(private readonly officeLinkService: OfficeLinkService) {}

  @Public()
  @Get(':slug')
  @HttpCode(HttpStatus.FOUND)
  @ApiFoundResponse({
    description: 'The user will be redirected (HTTP 302 Found).',
  })
  async trackOffice(
    @Res() res: Response,
    @Query('sig') sig: string,
    @Param('slug') slug: string,
  ) {
    const office = await this.officeLinkService.validateOfficeLink(slug, sig);

    // set cookie to lock attribution
    res.cookie('office_ref', office?._id.toString(), {
      httpOnly: true,
      sameSite: 'lax',
      domain: 'localhost',
      // domain: '.dressdoctor.io',
      maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
    });

    res.redirect(process.env.DD_WEB_URL!);
  }
}
