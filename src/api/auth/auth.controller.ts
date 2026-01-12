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
import { Public } from 'src/helper/decorator/public.decorator';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { LoginEntity } from './entities/auth.entity';
import { type Request } from 'express';
import { type AppRequest } from 'src/dto/request-data.dto';

@Controller('auth')
@ApiSecurity('x-api-key')
@ApiSecurity('x-api-secret')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @ApiBody({ type: LoginDto })
  @HttpCode(HttpStatus.CREATED)
  @ApiCreatedResponse({ type: LoginEntity })
  @ApiResponse({ status: HttpStatus.CREATED })
  @ApiOperation({ summary: 'Used to login client' })
  async login(@Body() data: LoginDto, @Req() req: AppRequest) {
    const platform = req.data.platform;
    this.logger.log(`[${platform}] ${data.phone} is trying to login`);
    return await this.authService.login(data, req.data);
  }
}
