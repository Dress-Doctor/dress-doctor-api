import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
} from '@nestjs/swagger';
import type { AppRequestWithUser } from 'src/dto/request-data.dto';
import { xApiKey, xApiSecret } from 'src/dto/swagger.dto';
import { FindAllUserTypeEntity } from './entities/user-type.entity';
import { UtilService } from './util.service';

@Controller('util')
@ApiHeader(xApiKey)
@ApiHeader(xApiSecret)
@ApiSecurity('x-api-key')
@ApiSecurity('x-api-secret')
@ApiBearerAuth('access-token')
export class UtilController {
  private readonly logger = new Logger(UtilController.name);

  constructor(private readonly utilService: UtilService) {}

  @Get('get-user-types')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: HttpStatus.OK })
  @ApiCreatedResponse({ type: FindAllUserTypeEntity })
  @ApiOperation({ summary: 'Used to get user types' })
  async findAllUserType(@Req() req: AppRequestWithUser) {
    const platform = req.data.platform;
    const phone = req.user.phone;

    const log = `[${platform}] ${phone} is getting all user type`;
    this.logger.log(log);

    return await this.utilService.findAllUserType();
  }
}
