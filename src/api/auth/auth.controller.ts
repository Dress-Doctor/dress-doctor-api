import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
} from '@nestjs/swagger';
import type { AppRequest } from 'src/dto/request-data.dto';
import { xApiKey, xApiSecret } from 'src/dto/swagger.dto';
import { Public } from 'src/helper/decorator/public.decorator';
import { AuthService } from './auth.service';
import { CompleteLoginDto, InitiateLoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh.dto';
import { maskPhone } from 'src/helper/pii';
import {
  clearAuthCookies,
  readRefreshCookie,
  setAuthCookies,
} from 'src/helper/auth-cookie';
import {
  CompleteLoginEntity,
  InitiateLoginEntity,
} from './entities/auth.entity';

@Controller('auth')
@ApiHeader(xApiKey)
@ApiHeader(xApiSecret)
@ApiSecurity('x-api-key')
@ApiSecurity('x-api-secret')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('initiate-login')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Used to initiate login' })
  @ApiResponse({ type: InitiateLoginEntity, status: HttpStatus.CREATED })
  async initiateLogin(@Body() data: InitiateLoginDto, @Req() req: AppRequest) {
    const platform = req.data.platform;

    this.logger.log(
      `[${platform}] ${maskPhone(data.identifier)} is trying to login`,
    );
    return await this.authService.initiateLogin(data);
  }

  @Public()
  @Post('resend-otp')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Re-send a login OTP for a pending login' })
  @ApiResponse({ type: InitiateLoginEntity, status: HttpStatus.CREATED })
  async resendOtp(@Body() data: InitiateLoginDto, @Req() req: AppRequest) {
    const platform = req.data.platform;

    this.logger.log(
      `[${platform}] ${maskPhone(data.identifier)} requested a new otp`,
    );
    return await this.authService.resendOtp(data);
  }

  @Public()
  @Post('complete-login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Used to complete login' })
  @ApiResponse({ status: HttpStatus.OK, type: CompleteLoginEntity })
  async completeLogin(
    @Body() data: CompleteLoginDto,
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const platform = req.data.platform;

    // Do not log `data` — it carries the OTP code (CLAUDE.md §12).
    this.logger.log(
      `[${platform}] ${maskPhone(data.identifier)} is trying to verify their otp`,
    );

    const result = await this.authService.completeLogin(data);
    setAuthCookies(res, result);
    return result;
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rotate a refresh token for a new token pair',
    description:
      'Browser clients may omit the body — the refresh token is read from the HttpOnly cookie.',
  })
  async refresh(
    @Body() data: RefreshTokenDto,
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.authService.refresh(
      this.resolveRefreshToken(data, req),
    );
    setAuthCookies(res, tokens);
    return tokens;
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke a refresh token' })
  async logout(
    @Body() data: RefreshTokenDto,
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Cleared before the revoke so a failed revoke still ends the browser
    // session rather than leaving a cookie the user cannot get rid of.
    clearAuthCookies(res);
    return await this.authService.logout(this.resolveRefreshToken(data, req));
  }

  /**
   * The token may arrive in the body (service/mobile clients) or in the
   * HttpOnly cookie (browsers, which cannot read it to put it in a body).
   */
  private resolveRefreshToken(data: RefreshTokenDto, req: AppRequest): string {
    const token = data.refreshToken ?? readRefreshCookie(req);
    if (!token) {
      throw new UnauthorizedException({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Invalid or expired refresh token',
      });
    }
    return token;
  }

  @Get('me')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Current authenticated user + abilities' })
  async me() {
    return await this.authService.me();
  }
}
