import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  HttpCode,
  HttpStatus,
  Logger,
  Request,
  Req,
  Ip,
} from '@nestjs/common';
import { PickupService } from './pickup.service';
import { CreatePickupDto } from './dto/create-pickup.dto';
import { UpdatePickupDto } from './dto/update-pickup.dto';
import { ApiBody, ApiOperation } from '@nestjs/swagger';

@Controller('pickup')
export class PickupController {
  private readonly logger = new Logger(PickupController.name);
  constructor(private readonly pickupService: PickupService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiBody({ type: CreatePickupDto })
  @ApiOperation({ summary: 'Used to schedule a pickup' })
  async create(@Body() data: CreatePickupDto, @Ip() ipAddress: string) {
    const log = `${data.phone} is scheduling a pickup with ${JSON.stringify(data)}`;
    this.logger.log(log);

    return await this.pickupService.create(data);
  }

  @Get()
  findAll() {
    return this.pickupService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.pickupService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updatePickupDto: UpdatePickupDto) {
    return this.pickupService.update(+id, updatePickupDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.pickupService.remove(+id);
  }
}
