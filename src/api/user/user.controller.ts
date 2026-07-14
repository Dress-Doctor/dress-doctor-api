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
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
} from '@nestjs/swagger';
import type { AppRequestWithUser } from 'src/dto/request-data.dto';
import {
  ApiSuccessResponse,
  ApiSuccessResponseWithPagination,
  xApiKey,
  xApiSecret,
} from 'src/dto/swagger.dto';
import { AssignRoleDto } from './dto/assign-role.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { FindAllUserDto } from './dto/find-all-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserService } from './user.service';

@Controller('user')
@ApiHeader(xApiKey)
@ApiHeader(xApiSecret)
@ApiSecurity('x-api-key')
@ApiSecurity('x-api-secret')
@ApiBearerAuth('access-token')
export class UserController {
  private readonly logger = new Logger(UserController.name);
  constructor(private readonly userService: UserService) {}

  @Post('new-user')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('access-token')
  @ApiBody({ type: CreateUserDto })
  @ApiOperation({ summary: 'Create any user account' })
  @ApiResponse({ status: HttpStatus.OK, type: ApiSuccessResponse })
  async newUser(@Req() req: AppRequestWithUser, @Body() data: CreateUserDto) {
    const platform = req.data.platform;
    const phone = req.user.phone;

    const log = `[${platform}] ${phone} is trying is creating a user with ${JSON.stringify(data)}`;
    this.logger.log(log);

    return await this.userService.newUser(data);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all users' })
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

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get a user by id' })
  @ApiResponse({ status: HttpStatus.OK, type: ApiSuccessResponse })
  async findOne(@Param('id') id: string) {
    return await this.userService.findOne(id);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update a user profile' })
  @ApiResponse({ status: HttpStatus.OK, type: ApiSuccessResponse })
  async update(@Param('id') id: string, @Body() data: UpdateUserDto) {
    return await this.userService.update(id, data);
  }

  @Post(':id/roles')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Assign a role (global, or per-office if officeId)',
  })
  @ApiResponse({ status: HttpStatus.CREATED, type: ApiSuccessResponse })
  async assignRole(@Param('id') id: string, @Body() data: AssignRoleDto) {
    return await this.userService.assignRole(id, data);
  }

  @Delete(':id/roles/:roleId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke a role from a user' })
  @ApiResponse({ status: HttpStatus.OK, type: ApiSuccessResponse })
  async revokeRole(@Param('id') id: string, @Param('roleId') roleId: string) {
    return await this.userService.revokeRole(id, roleId);
  }

  @Patch(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-deactivate a user' })
  @ApiResponse({ status: HttpStatus.OK, type: ApiSuccessResponse })
  async deactivate(@Param('id') id: string) {
    return await this.userService.deactivate(id);
  }
}
