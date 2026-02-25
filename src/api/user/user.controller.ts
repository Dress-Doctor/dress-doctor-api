import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
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
import { CreateUserDto } from './dto/create-user.dto';
import { UserService } from './user.service';
import { FindAllUserDto } from './dto/find-all-user.dto';

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
  @ApiBearerAuth('access-token')
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
}
