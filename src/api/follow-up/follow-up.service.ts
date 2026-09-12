import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { type AppRequestWithUser } from 'src/dto/request-data.dto';
import { CaslActionsDto, CaslSubjectsDto } from 'src/helper/casl/casl.dto';
import { AppUtilService } from 'src/helper/service/app-util.service';
import { FollowUp } from 'src/schema/follow-up/follow-up.schema';
import { Customer } from 'src/schema/user/customer.schema';
import { Notification } from 'src/schema/notification/notification.schema';
import { FindFollowUpDto } from './dto/find-follow-up.dto';
import { ResolveFollowUpDto } from './dto/resolve-follow-up.dto';

@Injectable()
export class FollowUpService {
  private readonly logger = new Logger(FollowUpService.name);

  constructor(
    @InjectModel(FollowUp.name) private readonly followUpModel: Model<FollowUp>,
    @Inject(REQUEST) private readonly req: AppRequestWithUser,
    private readonly appUtilService: AppUtilService,
  ) {}

  private can(action: CaslActionsDto, subject: CaslSubjectsDto) {
    const platform = this.req.data.platform;
    const { phone, ability } = this.req.user;

    if (!ability.can(action, subject)) {
      const log = 'not authorized to perform this action';
      this.logger.error(`[${platform}] ${phone} is ${log}`);
      throw new ForbiddenException(`You are ${log}`);
    }
  }

  async findAll({ page, size, ...query }: FindFollowUpDto) {
    this.can('READ', 'FollowUp');

    const match: Record<string, unknown> = {};
    if (query.customerId)
      match.customerId = new Types.ObjectId(query.customerId);
    if (query.resolved === true) match.resolvedAt = { $ne: null };
    if (query.resolved === false) match.resolvedAt = null;

    const skip = (page - 1) * size;
    const sort = this.appUtilService.parseSortParam(
      query.sort ?? 'triggeredAt:desc',
    );
    const total = await this.followUpModel.countDocuments(match);

    const data = await this.followUpModel
      .find(match)
      .sort(sort)
      .skip(skip)
      .limit(size)
      .populate({ model: Customer.name, path: 'customerId' })
      .populate({ model: Notification.name, path: 'notificationId' })
      .exec();

    const totalPages = Math.ceil(total / size);
    const nextPage = page < totalPages ? page + 1 : null;
    return { total, data, nextPage };
  }

  /** CS marks the alert handled — clears the re-alert block for this customer. */
  async resolve(id: string, dto: ResolveFollowUpDto): Promise<string> {
    this.can('UPDATE', 'FollowUp');
    const platform = this.req.data.platform;
    const { phone } = this.req.user;

    const followUp = await this.followUpModel.findById(new Types.ObjectId(id));
    if (!followUp) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Follow-up not found',
      });
    }
    if (followUp.resolvedAt) {
      // Idempotent: resolving twice is a no-op, not an error.
      return 'Follow-up already resolved';
    }

    followUp.resolvedAt = new Date();
    followUp.resolvedBy = new Types.ObjectId(this.req.user.userId);
    followUp.resolutionNote = dto.note;
    await followUp.save();

    this.logger.log(
      `[${platform}] ${phone} resolved follow-up ${followUp._id.toString()}`,
    );
    return 'Follow-up resolved';
  }
}
