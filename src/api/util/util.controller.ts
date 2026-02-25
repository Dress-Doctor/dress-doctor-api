import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
} from '@nestjs/swagger';
import {
  type AppRequestWithUser,
  PaginationDto,
} from 'src/dto/request-data.dto';
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

  @Get('get-all-user-types')
  @HttpCode(HttpStatus.OK)
  @ApiQuery({ type: PaginationDto })
  @ApiOperation({ summary: 'Get all user types' })
  @ApiResponse({ status: HttpStatus.OK, type: FindAllUserTypeEntity })
  async findAllUserType(
    @Query() query: PaginationDto,
    @Req() req: AppRequestWithUser,
  ) {
    const platform = req.data.platform;
    const phone = req.user.phone;

    const log = `[${platform}] ${phone} is getting all user type with query ${JSON.stringify(query)}`;
    this.logger.log(log);

    return await this.utilService.findAllUserType(query);
  }

  @Get('get-all-pickup-statuses')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: HttpStatus.OK })
  @ApiOperation({ summary: 'Get all pickup statuses' })
  async findAllPickupStatuses(
    @Query() query: PaginationDto,
    @Req() req: AppRequestWithUser,
  ) {
    const platform = req.data.platform;
    const phone = req.user.phone;

    const log = `[${platform}] ${phone} is getting all admin users with query ${JSON.stringify(query)}`;
    this.logger.log(log);

    return await this.utilService.findAllPickupStatuses(query);
  }
}
