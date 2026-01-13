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
  ApiCreatedResponse,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
} from '@nestjs/swagger';
import { type AppRequest } from 'src/dto/request-data.dto';
import { Public } from 'src/helper/decorator/public.decorator';
import { AuthService } from './auth.service';
import { CompleteLoginDto, InitiateLoginDto } from './dto/login.dto';
import {
  CompleteLoginEntity,
  InitiateLoginEntity,
} from './entities/auth.entity';

@Controller('auth')
@ApiSecurity('x-api-key')
@ApiSecurity('x-api-secret')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('initiate-login')
  @HttpCode(HttpStatus.CREATED)
  @ApiBody({ type: InitiateLoginDto })
  @ApiResponse({ status: HttpStatus.CREATED })
  @ApiCreatedResponse({ type: InitiateLoginEntity })
  @ApiOperation({ summary: 'Used to initiate login' })
  async initiateLogin(@Body() data: InitiateLoginDto, @Req() req: AppRequest) {
    const platform = req.data.platform;

    this.logger.log(`[${platform}] ${data.phone} is trying to login`);
    return await this.authService.initiateLogin(data);
  }

  @Public()
  @Post('complete-login')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: HttpStatus.OK })
  @ApiCreatedResponse({ type: CompleteLoginEntity })
  @ApiOperation({ summary: 'Used to complete login' })
  async completeLogin(@Body() data: CompleteLoginDto, @Req() req: AppRequest) {
    const platform = req.data.platform;

    this.logger.log(
      `[${platform}] ${data.identifier} is trying to verify their otp with ${JSON.stringify(data)}`,
    );

    return await this.authService.completeLogin(data);
  }
}
