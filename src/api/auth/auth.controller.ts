import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
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
  async completeLogin(@Body() data: CompleteLoginDto, @Req() req: AppRequest) {
    const platform = req.data.platform;

    // Do not log `data` — it carries the OTP code (CLAUDE.md §12).
    this.logger.log(
      `[${platform}] ${maskPhone(data.identifier)} is trying to verify their otp`,
    );

    return await this.authService.completeLogin(data);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate a refresh token for a new token pair' })
  async refresh(@Body() data: RefreshTokenDto) {
    return await this.authService.refresh(data);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke a refresh token' })
  async logout(@Body() data: RefreshTokenDto) {
    return await this.authService.logout(data);
  }

  @Get('me')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Current authenticated user + abilities' })
  async me() {
    return await this.authService.me();
  }
}
