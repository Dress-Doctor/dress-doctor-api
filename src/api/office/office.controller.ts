import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiProduces,
  ApiResponse,
  ApiSecurity,
} from '@nestjs/swagger';
import {
  PaginationDto,
  type AppRequestWithUser,
} from 'src/dto/request-data.dto';
import {
  ApiSuccessResponse,
  ApiSuccessResponseWithPagination,
  xApiKey,
  xApiSecret,
  xChangeReason,
} from 'src/dto/swagger.dto';
import { AssignOfficeUserDto } from './dto/assign-office-user.dto';
import { CreateOfficeDto } from './dto/create-office.dto';
import { ExportOfficeDto } from './dto/export-office.dto';
import { FindOfficeDto } from './dto/find-office.dto';
import {
  OfficeCodeParamsDto,
  OfficePerformanceDto,
  OfficeUserParamsDto,
  OfficeWindowDto,
} from './dto/office-detail.dto';
import { UpdateOfficeDto } from './dto/update-office.dto';
import { OfficeKpiEntity } from './entities/office-kpi.entity';
import { OfficeService } from './office.service';

@Controller('offices')
@ApiHeader(xApiKey)
@ApiHeader(xApiSecret)
@ApiHeader(xChangeReason)
@ApiSecurity('x-api-key')
@ApiSecurity('x-api-secret')
@ApiBearerAuth('access-token')
export class OfficeController {
  private readonly logger = new Logger(OfficeController.name);
  constructor(private readonly officeService: OfficeService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create an office (GLOBAL)' })
  @ApiResponse({ status: HttpStatus.CREATED, type: ApiSuccessResponse })
  async create(@Body() data: CreateOfficeDto) {
    return await this.officeService.create(data);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List offices' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: ApiSuccessResponseWithPagination,
  })
  async findAll(@Query() query: FindOfficeDto) {
    return await this.officeService.findAll(query);
  }

  @Get('export')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Export filtered offices as a CSV or Excel download',
    description:
      'Takes the same query params as GET /offices, page/size aside — an ' +
      'export always spans the full filtered set. The signed link and QR ' +
      'code URL are never included: both carry the office HMAC.',
  })
  @ApiProduces(
    'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  async exportOffices(
    @Query() query: ExportOfficeDto,
    @Req() req: AppRequestWithUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { platform } = req.data;
    this.logger.log(
      `[${platform}] ${req.user.phone} is exporting offices as ${query.format}`,
    );
    const { buffer, filename, contentType } =
      await this.officeService.exportOffices(query);
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
    summary: 'Headline office counts for the dashboard, over the list filters',
    description:
      'Takes the same query params as GET /offices. `totalOffices` respects ' +
      'every filter, `isActive` included. `byStatusCount` is the exception: ' +
      'it is counted over the same filters minus `isActive`, so a status tab ' +
      'strip keeps every count whichever tab is selected. `totalActive` and ' +
      '`totalInactive` are that breakdown restated as flat figures.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: OfficeKpiEntity })
  async getOfficeKpis(
    @Query() query: FindOfficeDto,
    @Req() req: AppRequestWithUser,
  ) {
    const { platform } = req.data;
    this.logger.log(
      `[${platform}] ${req.user.phone} is fetching office kpis with query ${JSON.stringify(query)}`,
    );
    return await this.officeService.getOfficeKpis(query);
  }

  @Get('mine')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'The offices the caller may work in',
    description:
      "The admin panel's office switcher reads this. It is NOT gated on " +
      '`READ Office`: a counter clerk has no authority over the office file ' +
      'yet still has to know which branch they are stood at, and what comes ' +
      'back is their own postings. A role whose `READ Office` grant carries ' +
      'no conditions is GLOBAL and gets every open branch instead — ' +
      '`canSwitch` says which of the two answers this is. Closed offices are ' +
      'left out either way.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: ApiSuccessResponse })
  async findMine(@Req() req: AppRequestWithUser) {
    const { platform } = req.data;
    this.logger.log(`[${platform}] ${req.user.phone} is listing their offices`);
    return await this.officeService.findMine();
  }

  // Declared after every static GET above so `export`, `kpis` and `mine` are
  // never read as an office code.
  @Get(':officeCode')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get one office by its code, with its type resolved',
    description:
      'Addressed by the human-readable `officeCode` (`OF-JNYJ`), which is ' +
      'what staff read off the branch paperwork and what the admin panel ' +
      'puts in the URL. A Mongo id is still accepted so callers written ' +
      'against the old `:id` route keep working.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: ApiSuccessResponse })
  async findOne(@Param() { officeCode }: OfficeCodeParamsDto) {
    return await this.officeService.findOne(officeCode);
  }

  @Patch(':officeCode')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update an office',
    description:
      'Covers name, type, address, city, region, QR code and status. ' +
      '`officeCode` and `slug` are immutable — the public link is built from ' +
      'the slug, and changing it would break every printed QR code.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: ApiSuccessResponse })
  async update(
    @Param() { officeCode }: OfficeCodeParamsDto,
    @Body() data: UpdateOfficeDto,
  ) {
    return await this.officeService.update(officeCode, data);
  }

  @Get(':officeCode/summary')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Headline figures for one office over a date window',
    description:
      'Orders, pickups, money and customers are counted over the window. ' +
      'Staff and days-open ignore it on purpose: they describe the office as ' +
      'it stands today. With neither bound given the window is the office ' +
      'whole life.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: ApiSuccessResponse })
  async getSummary(
    @Param() { officeCode }: OfficeCodeParamsDto,
    @Query() query: OfficeWindowDto,
  ) {
    return await this.officeService.getOfficeSummary(officeCode, query);
  }

  @Get(':officeCode/operations')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Orders and pickups at this office broken down by status',
    description:
      'Counts are for the window; each status is the record current one. ' +
      'The two are counted independently — an order can exist without a ' +
      'pickup, and a pickup can exist with no orders raised from it.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: ApiSuccessResponse })
  async getOperations(
    @Param() { officeCode }: OfficeCodeParamsDto,
    @Query() query: OfficeWindowDto,
  ) {
    return await this.officeService.getOperations(officeCode, query);
  }

  @Get(':officeCode/performance')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'One series for the office performance chart',
    description:
      'Pick the series with `metric` (orders, pickups, collected, ' +
      'customers) and its bucket width with `interval` (hourly, daily, ' +
      'weekly, monthly, quarterly, yearly). Quiet buckets come back as zero ' +
      'rather than missing. `deltaPercent` compares the window with the one ' +
      'of the same length before it, and is null when there is nothing to ' +
      'compare with.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: ApiSuccessResponse })
  async getPerformance(
    @Param() { officeCode }: OfficeCodeParamsDto,
    @Query() query: OfficePerformanceDto,
  ) {
    return await this.officeService.getPerformance(officeCode, query);
  }

  @Get(':officeCode/insights')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'How work arrives at this office and what it turns into',
    description:
      'The pickup/direct split, what pickups produce, and the four rates ' +
      'under them: average order value, completion, collection and orders ' +
      'per active staff member.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: ApiSuccessResponse })
  async getInsights(
    @Param() { officeCode }: OfficeCodeParamsDto,
    @Query() query: OfficeWindowDto,
  ) {
    return await this.officeService.getInsights(officeCode, query);
  }

  @Get(':officeCode/history')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Audit trail of the office and its staff (paginated)',
    description:
      'The office own profile and status changes merged with every staff ' +
      'assignment and revocation, newest first. Each entry says which trail ' +
      'it came from, carries only what changed (field, from, to) with ' +
      'foreign keys labelled, and who changed it and why.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    type: ApiSuccessResponseWithPagination,
  })
  async findHistory(
    @Param() { officeCode }: OfficeCodeParamsDto,
    @Query() query: PaginationDto,
  ) {
    return await this.officeService.findHistory(officeCode, query);
  }

  @Post(':officeCode/link')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mint a fresh signed public link for this office',
    description:
      'The previous link stops working immediately, so anyone holding a ' +
      'printed QR code is cut off. Gated on UPDATE for that reason.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: ApiSuccessResponse })
  async regenerateLink(@Param() { officeCode }: OfficeCodeParamsDto) {
    return await this.officeService.regenerateLink(officeCode);
  }

  @Get(':officeCode/users')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List users assigned to an office',
    description:
      'Revoked assignments come back too, flagged inactive: the staff card ' +
      'shows them greyed rather than hiding that someone left.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: ApiSuccessResponse })
  async listUsers(@Param() { officeCode }: OfficeCodeParamsDto) {
    return await this.officeService.listUsers(officeCode);
  }

  @Post(':officeCode/users')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Assign a user (with a role) to an office',
    description:
      'Re-assigning someone who was revoked revives the same row rather ' +
      'than adding a second one, so the trail reads as one continuous ' +
      'posting.',
  })
  @ApiResponse({ status: HttpStatus.CREATED, type: ApiSuccessResponse })
  async assignUser(
    @Param() { officeCode }: OfficeCodeParamsDto,
    @Body() data: AssignOfficeUserDto,
  ) {
    return await this.officeService.assignUser(officeCode, data);
  }

  @Delete(':officeCode/users/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Remove a user from an office',
    description:
      'A soft revoke: the assignment is flagged inactive rather than ' +
      'deleted, so it stays in the audit trail with its reason and date.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: ApiSuccessResponse })
  async revokeUser(@Param() { officeCode, userId }: OfficeUserParamsDto) {
    return await this.officeService.revokeUser(officeCode, userId);
  }
}
