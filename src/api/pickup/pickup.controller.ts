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
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
} from '@nestjs/swagger';
import type { AppRequest, AppRequestWithUser } from 'src/dto/request-data.dto';
import { Public } from 'src/helper/decorator/public.decorator';
import { AssignPickupDto } from './dto/assign-pickup.dto';
import { CreatePickupDto } from './dto/create-pickup.dto';
import { SchedulePickupEntity } from './entities/pickup.entity';
import { PickupService } from './pickup.service';
import { xApiKey, xApiSecret } from 'src/dto/swagger.dto';

@ApiHeader(xApiKey)
@Controller('pickup')
@ApiHeader(xApiSecret)
@ApiSecurity('x-api-key')
@ApiSecurity('x-api-secret')
export class PickupController {
  private readonly logger = new Logger(PickupController.name);
  constructor(private readonly pickupService: PickupService) {}

  @Public()
  @Post('schedule-pickup')
  @HttpCode(HttpStatus.CREATED)
  @ApiBody({ type: CreatePickupDto })
  @ApiCreatedResponse({ type: SchedulePickupEntity })
  @ApiOperation({ summary: 'Used to schedule a pickup' })
  async create(@Req() req: AppRequest, @Body() data: CreatePickupDto) {
    const platform = req.data.platform;
    const log = `[${platform}] ${data.phone} is scheduling a pickup with ${JSON.stringify(data)}`;

    this.logger.log(log);
    return await this.pickupService.schedulePickup(data);
  }

  @Post('assign-to-agent')
  @HttpCode(HttpStatus.CREATED)
  @ApiBody({ type: AssignPickupDto })
  @ApiResponse({ status: HttpStatus.CREATED })
  @ApiOperation({ summary: 'Assign pickup to agent to an agent' })
  async assignPickup(
    @Req() req: AppRequestWithUser,
    @Body() data: AssignPickupDto,
  ) {
    const phone = req.user.phone;
    const platform = req.data.platform;

    const log = `[${platform}] ${phone} is trying to assign pickup to an agent with ${JSON.stringify(data)}`;
    this.logger.log(log);
    return await this.pickupService.assignPickup(data);
  }
}
