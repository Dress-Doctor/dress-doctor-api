import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { type AppRequestWithUser } from 'src/dto/request-data.dto';
import { ActivityReadService } from './activity.service';
import { FindActivityDto } from './dto/find-activity.dto';
import { FindAllActivityEntity } from './entities/activity.entity';
import { ApiSuccessResponse } from 'src/dto/swagger.dto';
import { ActivityUserParamsDto } from './dto/activity-user-params.dto';

@ApiTags('Activity')
@Controller({ path: 'activity', version: '1' })
export class ActivityController {
  private readonly logger = new Logger(ActivityController.name);

  constructor(private readonly activityService: ActivityReadService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Who did what, newest first',
    description:
      'The per-actor trail: one row per thing a user did — every audited ' +
      'write, every sign-in, every bulk export. Complements the per-record ' +
      'history on `GET /orders/:orderCode` and friends, which answers the ' +
      'other question (what happened to this record, field by field). ' +
      'Rows are scoped by the caller`s own CASL conditions, so an ' +
      'office-scoped reviewer sees their branch and nothing else. ' +
      'IP and user-agent are returned with every row, so a role that may ' +
      'read the trail can see where a colleague was working from.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: FindAllActivityEntity })
  async findAll(
    @Query() query: FindActivityDto,
    @Req() req: AppRequestWithUser,
  ) {
    const platform = req.data.platform;
    const phone = req.user.phone;

    this.logger.log(`[${platform}] ${phone} is reading the activity trail`);

    return await this.activityService.findAll(query);
  }

  @Get('users/:reference/resources')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'The kinds of record one person has touched',
    description:
      'Feeds the resource filter on the staff file. Its own route rather ' +
      'than a facet on the trail, because the list has to stay the same ' +
      'whichever narrowing is already applied — a filter that only offers ' +
      'the value already chosen cannot be used to choose again. Scoped by ' +
      'the caller`s own CASL conditions, like the trail itself.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: ApiSuccessResponse })
  async resourcesForUser(
    @Param() params: ActivityUserParamsDto,
    @Req() req: AppRequestWithUser,
  ) {
    const platform = req.data.platform;
    const phone = req.user.phone;

    this.logger.log(
      `[${platform}] ${phone} is listing the activity resources of ${params.reference}`,
    );

    return await this.activityService.resourcesForUser(params.reference);
  }

  @Get('users/:reference')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Everything one person did',
    description:
      'The same trail narrowed to one actor, addressed by user reference ' +
      '(`US-4B2C`) the way the rest of the platform addresses a user. An ' +
      'unknown reference is a 400, not an empty page, so a typo cannot read ' +
      'as "this person did nothing".',
  })
  @ApiResponse({ status: HttpStatus.OK, type: FindAllActivityEntity })
  async findForUser(
    @Param() params: ActivityUserParamsDto,
    @Query() query: FindActivityDto,
    @Req() req: AppRequestWithUser,
  ) {
    const platform = req.data.platform;
    const phone = req.user.phone;

    this.logger.log(
      `[${platform}] ${phone} is reading the activity of ${params.reference}`,
    );

    return await this.activityService.findForUser(params.reference, query);
  }
}
