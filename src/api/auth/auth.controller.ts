import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBody,
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
  @ApiBody({ type: InitiateLoginDto })
  @ApiOperation({ summary: 'Used to initiate login' })
  @ApiResponse({ type: InitiateLoginEntity, status: HttpStatus.CREATED })
  async initiateLogin(@Body() data: InitiateLoginDto, @Req() req: AppRequest) {
    const platform = req.data.platform;

    this.logger.log(`[${platform}] ${data.phone} is trying to login`);
    return await this.authService.initiateLogin(data);
  }

  @Public()
  @Post('complete-login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Used to complete login' })
  @ApiResponse({ status: HttpStatus.OK, type: CompleteLoginEntity })
  async completeLogin(@Body() data: CompleteLoginDto, @Req() req: AppRequest) {
    const platform = req.data.platform;

    this.logger.log(
      `[${platform}] ${data.identifier} is trying to verify their otp with ${JSON.stringify(data)}`,
    );

    return await this.authService.completeLogin(data);
  }
}
