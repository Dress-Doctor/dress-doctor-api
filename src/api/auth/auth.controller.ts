import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { Public } from 'src/helper/decorator/public.decorator';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { LoginEntity } from './entities/auth.entity';

@Controller('auth')
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
  async login(@Body() data: LoginDto) {
    this.logger.log(`${data.phone} is trying to login`);
    return await this.authService.login(data);
  }
}
