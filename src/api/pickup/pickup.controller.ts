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
  ApiSecurity,
} from '@nestjs/swagger';
import type { AppRequest } from 'src/dto/request-data.dto';
import { Public } from 'src/helper/decorator/public.decorator';
import { CreatePickupDto } from './dto/create-pickup.dto';
import { SchedulePickupEntity } from './entities/pickup.entity';
import { PickupService } from './pickup.service';

@Controller('pickup')
@ApiSecurity('x-api-key')
@ApiSecurity('x-api-secret')
export class PickupController {
  private readonly logger = new Logger(PickupController.name);
  constructor(private readonly pickupService: PickupService) {}

  @Post()
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @ApiBody({ type: CreatePickupDto })
  @ApiBody({ type: CreatePickupDto })
  @ApiCreatedResponse({ type: SchedulePickupEntity })
  @ApiOperation({ summary: 'Used to schedule a pickup' })
  async create(@Req() req: AppRequest, @Body() data: CreatePickupDto) {
    const platform = req.data.platform;
    const log = `[${platform}] ${data.phone} is scheduling a pickup with ${JSON.stringify(data)}`;

    this.logger.log(log);
    return await this.pickupService.schedulePickup(data);
  }
}
