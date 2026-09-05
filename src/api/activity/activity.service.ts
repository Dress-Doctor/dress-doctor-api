import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage } from 'mongoose';
import { type AppRequestWithUser } from 'src/dto/request-data.dto';
import { scopeFilter } from 'src/helper/casl/casl-scope';
import { CaslActionsDto, CaslSubjectsDto } from 'src/helper/casl/casl.dto';
import { AppUtilService } from 'src/helper/service/app-util.service';
import { Activity } from 'src/schema/activity/activity.schema';
import { User } from 'src/schema/user/user.schema';
import { FindActivityDto } from './dto/find-activity.dto';

@Injectable()
export class ActivityReadService {
  private readonly logger = new Logger(ActivityReadService.name);

  constructor(
    private readonly appUtilService: AppUtilService,
    @Inject(REQUEST) private readonly req: AppRequestWithUser,
    @InjectModel(Activity.name) private readonly activityModel: Model<Activity>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
  ) {}

  private can(action: CaslActionsDto, subject: CaslSubjectsDto) {
    const platform = this.req.data.platform;
    const { phone, ability } = this.req.user;

    if (!ability.can(action, subject)) {
      const log = 'not authorized to perform this action';
      this.logger.error(`[${platform}] ${phone} is ${log}`);
      throw new BadRequestException(`You are ${log}`);
    }
  }

  /**
   * Turn the query into a filter.
   *
   * The office scope comes from the caller's own CASL conditions rather than
   * anything they send: an OFFICE-scoped reviewer sees what happened at their
   * branch, a GLOBAL one sees everything, and neither can ask for otherwise.
   */
  private async buildFilter(
    query: Omit<FindActivityDto, 'page' | 'size' | 'sort'>,
  ): Promise<Record<string, unknown>> {
    const { ability } = this.req.user;
    const where: Record<string, unknown> = {
      ...scopeFilter(ability, 'READ', 'Activity'),
    };

    if (query.userReference) {
      const actor = await this.userModel
        .findOne({ reference: query.userReference })
        .select('_id')
        .lean();
      // An unknown reference must return nothing rather than everything —
      // dropping the clause would widen the query instead of narrowing it.
      where.userId = actor?._id ?? { $in: [] };
    }

    if (query.kind) where.kind = query.kind;
    if (query.action) where.action = query.action;
    if (query.resource) where.resource = query.resource;
    if (query.resourceRef) where.resourceRef = query.resourceRef;

    const range: Record<string, Date> = {};
    if (query.startDate) range.$gte = new Date(query.startDate);
    const end = this.appUtilService.parseRangeEnd(query.endDate);
    if (end) range.$lte = end;
    if (Object.keys(range).length) where.createdAt = range;

    return where;
  }

  /**
   * The trail for one actor, or for everyone the caller may see — newest
   * first, which is the order the `{ userId, createdAt }` index is built for.
   */
  async findAll({ page, size, ...query }: FindActivityDto) {
    this.can('READ', 'Activity');

    const platform = this.req.data.platform;
    const { phone } = this.req.user;

    const where = await this.buildFilter(query);
    const skip = (page - 1) * size;
    const sort = query.sort
      ? this.appUtilService.parseSortParam(query.sort)
      : { createdAt: -1 as const };

    const pipeline: PipelineStage[] = [
      { $match: where },
      { $sort: sort },
      { $skip: skip },
      { $limit: size },
      {
        $lookup: {
          as: 'actor',
          from: 'user',
          localField: 'userId',
          foreignField: '_id',
          pipeline: [
            { $project: { firstName: 1, lastName: 1, reference: 1, phone: 1 } },
          ],
        },
      },
      { $unwind: { path: '$actor', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          kind: 1,
          action: 1,
          resource: 1,
          resourceId: 1,
          resourceRef: 1,
          outcome: 1,
          reason: 1,
          officeId: 1,
          platform: 1,
          requestId: 1,
          metadata: 1,
          createdAt: 1,
          actor: {
            _id: '$actor._id',
            reference: '$actor.reference',
            firstName: '$actor.firstName',
            lastName: '$actor.lastName',
          },
        },
      },
    ];

    const total = await this.activityModel.countDocuments(where);
    const data = await this.activityModel.aggregate(pipeline);

    const totalPages = Math.ceil(total / size);
    const nextPage = page < totalPages ? page + 1 : null;

    this.logger.log(`[${platform}] ${phone} read the activity trail`);
    return { total, data, nextPage };
  }

  /**
   * Everything one actor did, addressed the way the rest of the platform
   * addresses a user — by reference, never by raw id.
   */
  async findForUser(reference: string, query: FindActivityDto) {
    const actor = await this.userModel
      .findOne({ reference })
      .select('_id')
      .lean();

    if (!actor) {
      throw new BadRequestException({
        code: 'USER_NOT_FOUND',
        message: 'No user with that reference',
      });
    }

    return await this.findAll({ ...query, userReference: reference });
  }
}
