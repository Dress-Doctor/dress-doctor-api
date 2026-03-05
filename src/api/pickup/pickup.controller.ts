import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  Query,
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
import {
  type AppRequest,
  type AppRequestWithUser,
} from 'src/dto/request-data.dto';
import { ApiSuccessResponse, xApiKey, xApiSecret } from 'src/dto/swagger.dto';
import { Public } from 'src/helper/decorator/public.decorator';
import {
  AssignPickupDto,
  PickupRequestParamsDto,
} from './dto/assign-pickup.dto';
import { CreatePickupDto } from './dto/create-pickup.dto';
import { FindPickupDto } from './dto/find-pickup.dto';
import { SchedulePickupEntity } from './entities/pickup.entity';
import { PickupService } from './pickup.service';

@ApiHeader(xApiKey)
@Controller('pickup')
@ApiHeader(xApiSecret)
@ApiSecurity('x-api-key')
@ApiSecurity('x-api-secret')
@ApiBearerAuth('access-token')
export class PickupController {
  private readonly logger = new Logger(PickupController.name);
  constructor(private readonly pickupService: PickupService) {}

  @Public()
  @Post('schedule')
  @HttpCode(HttpStatus.CREATED)
  @ApiCreatedResponse({ type: SchedulePickupEntity })
  @ApiOperation({ summary: 'Used to schedule a pickup' })
  async create(@Req() req: AppRequest, @Body() data: CreatePickupDto) {
    const platform = req.data.platform;
    const log = `[${platform}] ${data.phone} is scheduling a pickup with ${JSON.stringify(data)}`;

    this.logger.log(log);
    return await this.pickupService.schedulePickup(data);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: HttpStatus.OK })
  @ApiOperation({ summary: 'Get all pickups' })
  async findAll(@Query() query: FindPickupDto, @Req() req: AppRequestWithUser) {
    const platform = req.data.platform;
    const phone = req.user.phone;

    const log = `[${platform}] ${phone} is getting all user type with query ${JSON.stringify(query)}`;
    this.logger.log(log);

    return await this.pickupService.findAllPickup(query);
  }

  @Post(':pickupId/assign')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Assign pickup to agent to an agent' })
  @ApiResponse({ status: HttpStatus.OK, type: ApiSuccessResponse })
  async assignPickup(
    @Body() data: AssignPickupDto,
    @Req() req: AppRequestWithUser,
    @Param() params: PickupRequestParamsDto,
  ) {
    const phone = req.user.phone;
    const platform = req.data.platform;

    const log = `[${platform}] ${phone} is assigning pickup ${params.pickupId} to agent with ${JSON.stringify(data)}`;
    this.logger.log(log);
    return await this.pickupService.assignPickup(params, data);
  }

  @Post(':pickupId/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm pickup (set status to confirm)' })
  @ApiResponse({ status: HttpStatus.OK, type: ApiSuccessResponse })
  async confirmPickup(
    @Req() req: AppRequestWithUser,
    @Param() { pickupId: pickupRequestId }: PickupRequestParamsDto,
  ) {
    const { platform } = req.data;
    const phone = req.user.phone;
    const log = `[${platform}] ${phone} is confirming order ${pickupRequestId}`;
    this.logger.log(log);

    return await this.pickupService.confirmPickup(pickupRequestId);
  }
}
