import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
} from '@nestjs/swagger';
import {
  ApiSuccessResponse,
  xApiKey,
  xApiSecret,
  xChangeReason,
} from 'src/dto/swagger.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { DuplicateRoleDto } from './dto/duplicate-role.dto';
import { FindRoleDto } from './dto/find-role.dto';
import { FindRoleHoldersDto } from './dto/find-role-holders.dto';
import { RoleReferenceParamsDto } from './dto/role-params.dto';
import { SetRolePermissionsDto } from './dto/set-role-permissions.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RoleService } from './role.service';

/**
 * Roles and what they may do.
 *
 * Its own module rather than another tab on `/reference`: the other reference
 * collections are lists the app picks from, while a role is the authority
 * model itself — every write here changes what somebody may do tomorrow.
 */
@Controller('roles')
@ApiBearerAuth()
@ApiHeader(xApiKey)
@ApiHeader(xApiSecret)
@ApiHeader(xChangeReason)
@ApiSecurity('x-api-key')
@ApiSecurity('x-api-secret')
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get all roles',
    description:
      'Each row carries `permissionCount` and `holders`, because what a role ' +
      'grants and how many people it grants it to are the two things the ' +
      'list is read for.',
  })
  async findAll(@Query() query: FindRoleDto) {
    return await this.roleService.findAll(query);
  }

  @Get('kpis')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Headline role counts, over the list filters' })
  async getKpis(@Query() query: FindRoleDto) {
    return await this.roleService.getKpis(query);
  }

  /**
   * Declared before `:reference` on purpose: Nest matches in order, and
   * `permissions` would otherwise be read as a role reference.
   */
  @Get('permissions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Every permission that exists, for the role matrix',
    description:
      'The whole catalogue in one read — around 120 rows that change only ' +
      'when the API grows a subject, so it is not paged.',
  })
  async listPermissions() {
    return await this.roleService.listPermissions();
  }

  @Get(':reference')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'One role: what it is, what it grants, and who holds it',
  })
  async findOne(@Param() { reference }: RoleReferenceParamsDto) {
    return await this.roleService.findByReference(reference);
  }

  @Get(':reference/holders')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'The people holding this role, named',
    description:
      'Global grants and branch postings in one list, newest first. Gated on ' +
      'READ User as well as READ Role — the counts on the role itself say ' +
      'how many, this says who.',
  })
  async holders(
    @Param() { reference }: RoleReferenceParamsDto,
    @Query() query: FindRoleHoldersDto,
  ) {
    return await this.roleService.holders(reference, query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Add a role',
    description:
      'The reference is minted here. A new role grants nothing until its ' +
      'permissions are set.',
  })
  @ApiResponse({ status: HttpStatus.CREATED, type: ApiSuccessResponse })
  async create(@Body() data: CreateRoleDto) {
    return await this.roleService.create(data);
  }

  @Post(':reference/duplicate')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Copy a role, grants and all, under a new name',
    description:
      'One call, in a transaction: the copy either exists granting what the ' +
      'original grants, or does not exist. Nobody holds it.',
  })
  @ApiResponse({ status: HttpStatus.CREATED, type: ApiSuccessResponse })
  async duplicate(
    @Param() { reference }: RoleReferenceParamsDto,
    @Body() data: DuplicateRoleDto,
  ) {
    return await this.roleService.duplicate(reference, data);
  }

  @Patch(':reference')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reword a role or switch it off',
    description:
      'There is no delete: a role people still hold is switched off, never ' +
      'removed, or the postings pointing at it would name nothing.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: ApiSuccessResponse })
  async update(
    @Param() { reference }: RoleReferenceParamsDto,
    @Body() data: UpdateRoleDto,
  ) {
    return await this.roleService.update(reference, data);
  }

  @Put(':reference/permissions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Set what a role may do',
    description:
      'The full set, not a delta — the screen sends the matrix it is ' +
      'showing, so what is stored is what somebody looked at. Gated on ' +
      'UPDATE RolePermission, which is the authority to change what every ' +
      'holder of the role may do.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: ApiSuccessResponse })
  async setPermissions(
    @Param() { reference }: RoleReferenceParamsDto,
    @Body() data: SetRolePermissionsDto,
  ) {
    return await this.roleService.setPermissions(reference, data);
  }
}
