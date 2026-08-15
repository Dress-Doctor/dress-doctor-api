import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
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
  ApiSuccessResponseWithPagination,
  xApiKey,
  xApiSecret,
  xChangeReason,
} from 'src/dto/swagger.dto';
import { AssignOfficeUserDto } from './dto/assign-office-user.dto';
import { CreateOfficeDto } from './dto/create-office.dto';
import { FindOfficeDto } from './dto/find-office.dto';
import { UpdateOfficeDto } from './dto/update-office.dto';
import { OfficeService } from './office.service';

@Controller('offices')
@ApiHeader(xApiKey)
@ApiHeader(xApiSecret)
@ApiHeader(xChangeReason)
@ApiSecurity('x-api-key')
@ApiSecurity('x-api-secret')
@ApiBearerAuth('access-token')
export class OfficeController {
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

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get an office by id' })
  @ApiResponse({ status: HttpStatus.OK, type: ApiSuccessResponse })
  async findOne(@Param('id') id: string) {
    return await this.officeService.findOne(id);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update an office' })
  @ApiResponse({ status: HttpStatus.OK, type: ApiSuccessResponse })
  async update(@Param('id') id: string, @Body() data: UpdateOfficeDto) {
    return await this.officeService.update(id, data);
  }

  @Get(':id/users')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List users assigned to an office' })
  @ApiResponse({ status: HttpStatus.OK, type: ApiSuccessResponse })
  async listUsers(@Param('id') id: string) {
    return await this.officeService.listUsers(id);
  }

  @Post(':id/users')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Assign a user (with a role) to an office' })
  @ApiResponse({ status: HttpStatus.CREATED, type: ApiSuccessResponse })
  async assignUser(@Param('id') id: string, @Body() data: AssignOfficeUserDto) {
    return await this.officeService.assignUser(id, data);
  }

  @Delete(':id/users/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a user from an office' })
  @ApiResponse({ status: HttpStatus.OK, type: ApiSuccessResponse })
  async revokeUser(@Param('id') id: string, @Param('userId') userId: string) {
    return await this.officeService.revokeUser(id, userId);
  }
}
