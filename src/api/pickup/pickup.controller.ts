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
  Res,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOperation,
  ApiProduces,
  ApiResponse,
  ApiSecurity,
} from '@nestjs/swagger';
import { type Response } from 'express';
import {
  type AppRequest,
  type AppRequestWithUser,
} from 'src/dto/request-data.dto';
import {
  ApiSuccessResponse,
  xApiKey,
  xApiSecret,
  xChangeReason,
} from 'src/dto/swagger.dto';
import { Public } from 'src/helper/decorator/public.decorator';
import {
  AssignPickupDto,
  PickupRequestParamsDto,
} from './dto/assign-pickup.dto';
import { CreatePickupDto } from './dto/create-pickup.dto';
import { ExportPickupDto } from './dto/export-pickup.dto';
import { FindPickupDto } from './dto/find-pickup.dto';
import { PickupReferenceParamsDto } from './dto/pickup-reference-params.dto';
import { PickupDetailResponseEntity } from './entities/pickup-detail.entity';
import { PickupKpiEntity } from './entities/pickup-kpi.entity';
import { SchedulePickupEntity } from './entities/pickup.entity';
import { PickupService } from './pickup.service';

@ApiHeader(xApiKey)
@Controller('pickups')
@ApiHeader(xApiSecret)
@ApiHeader(xChangeReason)
@ApiSecurity('x-api-key')
@ApiSecurity('x-api-secret')
@ApiBearerAuth('access-token')
export class PickupController {
  private readonly logger = new Logger(PickupController.name);
  constructor(private readonly pickupService: PickupService) {}

  @Public()
  @Post()
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

  @Get('export')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Export filtered pickups as a CSV or Excel download',
    description:
      'Takes the same query params as GET /pickups and applies every one of ' +
      'them, `page`/`size` aside — an export always spans the full filtered ' +
      'set. Gated on its own EXPORT action, so it can be granted to ' +
      'reporting roles without handing out the rest of the pickup rights; ' +
      'the rows stay office-scoped to the caller either way.',
  })
  @ApiProduces(
    'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  async exportPickups(
    @Query() query: ExportPickupDto,
    @Req() req: AppRequestWithUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { platform } = req.data;
    this.logger.log(
      `[${platform}] ${req.user.phone} is exporting pickups as ${query.format}`,
    );
    const { buffer, filename, contentType } =
      await this.pickupService.exportPickups(query);
    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length.toString(),
    });
    return new StreamableFile(buffer);
  }

  @Get('kpis')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Headline pickup counts for the dashboard, over the list filters',
    description:
      'Takes the same query params as GET /pickups and applies every one of ' +
      'them, so the headline figures describe exactly the set the table is ' +
      'showing (`page`, `size` and `sort` aside). The `byPickupStatus` ' +
      'breakdown is the exception: it is always returned across every status, ' +
      'over the same filters minus `pickupStatusName`, so a tab strip keeps ' +
      'its counts whichever tab is selected.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: PickupKpiEntity })
  async getPickupKpis(
    @Query() query: FindPickupDto,
    @Req() req: AppRequestWithUser,
  ) {
    const { platform } = req.data;
    this.logger.log(
      `[${platform}] ${req.user.phone} is fetching pickup kpis with query ${JSON.stringify(query)}`,
    );
    return await this.pickupService.getPickupKpis(query);
  }

  // Declared after every static GET above so `export` and `kpis` are never
  // read as a pickup reference.
  @Get(':reference')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get one pickup by its reference, with its joins and history',
    description:
      'Everything a detail screen shows in one round trip: customer, office, ' +
      'status, who confirmed it, the agents it was assigned to, the orders ' +
      'raised off it (code, status, amounts and dates — the full order lives ' +
      'at GET /orders/:orderCode), and its audit trail. The trail carries ' +
      'only what changed (field, from, to), who changed it and why — never ' +
      'the stored snapshot — newest first, capped at the latest 100 entries, ' +
      'with foreign keys labelled (PENDING → CONFIRMED). Office/self scoped ' +
      'like the list: a pickup outside the caller’s scope returns 404.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: PickupDetailResponseEntity })
  async getPickupByReference(
    @Param() { reference }: PickupReferenceParamsDto,
    @Req() req: AppRequestWithUser,
  ) {
    const { platform } = req.data;
    this.logger.log(
      `[${platform}] ${req.user.phone} is fetching pickup ${reference}`,
    );
    return await this.pickupService.findByReference(reference);
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

  @Post(':pickupId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a pickup request' })
  @ApiResponse({ status: HttpStatus.OK, type: ApiSuccessResponse })
  async cancelPickup(
    @Req() req: AppRequestWithUser,
    @Param() { pickupId: pickupRequestId }: PickupRequestParamsDto,
  ) {
    const { platform } = req.data;
    const phone = req.user.phone;
    const log = `[${platform}] ${phone} is cancelling pickup ${pickupRequestId}`;
    this.logger.log(log);

    return await this.pickupService.cancelPickup(pickupRequestId);
  }
}
