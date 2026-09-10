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
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiProduces,
  ApiResponse,
  ApiSecurity,
} from '@nestjs/swagger';
import type { AppRequestWithUser } from 'src/dto/request-data.dto';
import {
  ApiSuccessResponse,
  ApiSuccessResponseWithPagination,
  xApiKey,
  xApiSecret,
  xChangeReason,
} from 'src/dto/swagger.dto';
import { AssignRoleDto } from './dto/assign-role.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { ExportUserDto } from './dto/export-user.dto';
import { FindAllUserDto } from './dto/find-all-user.dto';
import { PaginationDto } from 'src/dto/request-data.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import {
  UserReferenceParamsDto,
  UserRoleParamsDto,
} from './dto/user-reference.dto';
import { UserKpiEntity } from './entities/user-kpi.entity';
import { UserService } from './user.service';

@Controller('users')
@ApiHeader(xApiKey)
@ApiHeader(xApiSecret)
@ApiHeader(xChangeReason)
@ApiSecurity('x-api-key')
@ApiSecurity('x-api-secret')
@ApiBearerAuth('access-token')
export class UserController {
  private readonly logger = new Logger(UserController.name);
  constructor(private readonly userService: UserService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('access-token')
  @ApiBody({ type: CreateUserDto })
  @ApiOperation({
    summary: 'Create a staff account',
    description:
      'ADMIN only, like every other route here — a CUSTOMER or AFFILIATE ' +
      'type is refused with STAFF_ONLY. Register a customer through ' +
      '`POST /v1/customers`, which writes the `Customer` profile, its ' +
      '`customerCode` and any referral alongside the identity. Returns the ' +
      'new reference (`US-8KQTMR`) and nothing else — that is what every ' +
      'other user route is addressed by.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: ApiSuccessResponse })
  async newUser(@Req() req: AppRequestWithUser, @Body() data: CreateUserDto) {
    const platform = req.data.platform;
    const phone = req.user.phone;

    // The body carries a password for an admin account, so it is never logged.
    const log = `[${platform}] ${phone} is creating a ${data.userTypeId} user`;
    this.logger.log(log);

    return await this.userService.newUser(data);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List staff accounts',
    description:
      'ADMIN accounts only — this module answers for the people who sign ' +
      'in to work. Customers are read through `/v1/customers`, which knows ' +
      'about their orders, their spend and their home office. Filter with ' +
      '`q` (reference, names, email, phone, whatsapp phone), the ' +
      '`startDate`/`endDate` creation window and `isActive`. The password ' +
      'hash is never returned: the projection is an allow-list.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    type: ApiSuccessResponseWithPagination,
  })
  async getUserDetails(
    @Query() query: FindAllUserDto,
    @Req() req: AppRequestWithUser,
  ) {
    const platform = req.data.platform;
    const phone = req.user.phone;

    const log = `[${platform}] ${phone} is trying to get all users with query ${JSON.stringify(query)}`;
    this.logger.log(log);

    return await this.userService.findAll(query);
  }

  @Get('export')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Export the filtered staff accounts as a CSV or Excel download',
    description:
      'Takes the same query params as GET /users, page/size aside — an ' +
      'export always spans the full filtered set, and that set is ADMIN ' +
      'accounts only. The password hash is never included: the projection ' +
      'behind the file is an allow-list.',
  })
  @ApiProduces(
    'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  async exportUsers(
    @Query() query: ExportUserDto,
    @Req() req: AppRequestWithUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { platform } = req.data;
    this.logger.log(
      `[${platform}] ${req.user.phone} is exporting users as ${query.format}`,
    );
    const { buffer, filename, contentType } =
      await this.userService.exportUsers(query);
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
    summary: 'Headline staff counts for the dashboard, over the list filters',
    description:
      'Takes the same query params as GET /users, and counts ADMIN accounts ' +
      'only. `totalStaff` and `byStatusCount` respect the date window so the ' +
      'tab strip and the pager agree; `totalActive` and `totalInactive` ' +
      'ignore it on purpose — they describe the people on the books. ' +
      '`totalNew` is the figure the window answers: accounts created in it.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: UserKpiEntity })
  async getUserKpis(
    @Query() query: FindAllUserDto,
    @Req() req: AppRequestWithUser,
  ) {
    const { platform } = req.data;
    this.logger.log(
      `[${platform}] ${req.user.phone} is fetching user kpis with query ${JSON.stringify(query)}`,
    );
    return await this.userService.getUserKpis(query);
  }

  // Declared after every static GET above so `export` and `kpis` are never
  // read as a user reference.
  @Get(':reference')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get one staff account by its reference, with its type resolved',
    description:
      'Addressed by the human-readable `reference` (`US-8KQTMR`), which is ' +
      'what the admin panel puts in the URL. A mongo id is still accepted so ' +
      'callers written against the old `:id` route keep working. ADMIN only, ' +
      'like the list: a customer id here is a 404, not a way round ' +
      '`/v1/customers`.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: ApiSuccessResponse })
  async findOne(@Param() { reference }: UserReferenceParamsDto) {
    return await this.userService.findOne(reference);
  }

  @Patch(':reference')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update a user profile' })
  @ApiResponse({ status: HttpStatus.OK, type: ApiSuccessResponse })
  async update(
    @Param() { reference }: UserReferenceParamsDto,
    @Body() data: UpdateUserDto,
  ) {
    return await this.userService.update(reference, data);
  }

  @Get(':reference/roles')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List the roles a user holds, global and per-office alike',
    description:
      'The two live in different collections, so both are read and merged. ' +
      'Each entry says which it came from through `scope` (GLOBAL|OFFICE), ' +
      'and an office-scoped one carries the branch it applies at.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: ApiSuccessResponse })
  async listRoles(@Param() { reference }: UserReferenceParamsDto) {
    return await this.userService.listRoles(reference);
  }

  @Get(':reference/history')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Audit trail of the account and its postings (paginated)',
    description:
      'What happened TO this account — its own profile and status changes ' +
      'merged with every office posting granted or revoked on it, newest ' +
      'first. Each entry says which trail it came from, carries only what ' +
      'changed (field, from, to) with foreign keys labelled, and who ' +
      'changed it and why. What the person DID is the other question, ' +
      'answered by `GET /v1/activity/users/:reference`.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    type: ApiSuccessResponseWithPagination,
  })
  async findHistory(
    @Param() { reference }: UserReferenceParamsDto,
    @Query() query: PaginationDto,
  ) {
    return await this.userService.findHistory(reference, query);
  }

  @Post(':reference/roles')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Assign a role (global, or per-office if officeId)',
  })
  @ApiResponse({ status: HttpStatus.CREATED, type: ApiSuccessResponse })
  async assignRole(
    @Param() { reference }: UserReferenceParamsDto,
    @Body() data: AssignRoleDto,
  ) {
    return await this.userService.assignRole(reference, data);
  }

  @Delete(':reference/roles/:roleId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke a role from a user' })
  @ApiResponse({ status: HttpStatus.OK, type: ApiSuccessResponse })
  async revokeRole(@Param() { reference, roleId }: UserRoleParamsDto) {
    return await this.userService.revokeRole(reference, roleId);
  }

  @Patch(':reference/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-deactivate a user' })
  @ApiResponse({ status: HttpStatus.OK, type: ApiSuccessResponse })
  async deactivate(@Param() { reference }: UserReferenceParamsDto) {
    return await this.userService.deactivate(reference);
  }

  @Patch(':reference/reactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Put a deactivated user back to work',
    description:
      'The mirror of deactivate, and gated the same: switching an account ' +
      'back on is the same authority as switching it off.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: ApiSuccessResponse })
  async reactivate(@Param() { reference }: UserReferenceParamsDto) {
    return await this.userService.reactivate(reference);
  }
}
