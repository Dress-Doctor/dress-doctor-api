import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
import { FollowUpService } from './follow-up.service';
import { FollowUpParamsDto } from './dto/follow-up-params.dto';
import { FindFollowUpDto } from './dto/find-follow-up.dto';
import { ResolveFollowUpDto } from './dto/resolve-follow-up.dto';

@Controller('follow-ups')
@ApiHeader(xApiKey)
@ApiHeader(xApiSecret)
@ApiHeader(xChangeReason)
@ApiSecurity('x-api-key')
@ApiSecurity('x-api-secret')
@ApiBearerAuth('access-token')
export class FollowUpController {
  constructor(private readonly followUpService: FollowUpService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List inactivity follow-ups (filter customerId, resolved)',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    type: ApiSuccessResponseWithPagination,
  })
  async findAll(@Query() query: FindFollowUpDto) {
    return await this.followUpService.findAll(query);
  }

  @Post(':id/resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark a follow-up handled (clears the re-alert block)',
  })
  @ApiResponse({ status: HttpStatus.OK, type: ApiSuccessResponse })
  async resolve(
    @Param() param: FollowUpParamsDto,
    @Body() dto: ResolveFollowUpDto,
  ) {
    return await this.followUpService.resolve(param.id, dto);
  }
}
