import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { type AppRequest } from 'src/dto/request-data.dto';
import {
  ActivityKindEnum,
  ActivityOutcomeEnum,
} from 'src/schema/activity/activity.dto';
import { Activity } from 'src/schema/activity/activity.schema';
import { ActivityEntryDto, setActivityRecorder } from '../activity-recorder';

/** What a caller supplies; the request fills in the rest. */
export type RecordActivityDto = Omit<
  ActivityEntryDto,
  'officeId' | 'requestId' | 'platform' | 'ip' | 'userAgent'
>;

/**
 * Writes the who-did-what trail (§9). Best-effort by contract: an audit row
 * that cannot be written must never take the user's action down with it, so
 * every failure here is logged and swallowed.
 *
 * Registers itself as the recorder the history hook calls, so every audited
 * write lands in the trail without its service having to remember.
 */
@Injectable()
export class ActivityService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ActivityService.name);

  constructor(
    @InjectModel(Activity.name)
    private readonly activityModel: Model<Activity>,
  ) {}

  onModuleInit() {
    setActivityRecorder((entry) => this.record(entry));
  }

  onModuleDestroy() {
    setActivityRecorder(undefined);
  }

  /** Write one row. Never throws. */
  async record(entry: ActivityEntryDto): Promise<void> {
    const { session, ...row } = entry;
    try {
      await this.activityModel.create([{ ...row }], { session });
    } catch (err) {
      this.logger.error(
        `activity write failed (${entry.action}): ${(err as Error).message}`,
      );
    }
  }

  /**
   * The same, for anything happening inside a request: the office, platform,
   * request id and client fingerprint come off the request rather than being
   * plumbed through every call site.
   */
  async recordFromRequest(
    req: AppRequest,
    entry: RecordActivityDto,
  ): Promise<void> {
    await this.record({
      ...entry,
      officeId: req.data?.officeId,
      platform: req.data?.platform,
      // `req.id` is a global Express augmentation declared in
      // correlation-id.middleware.ts. The worker's ts-node program never
      // imports that file, so the augmentation is absent there and a bare
      // `req.id` fails to compile — read it structurally instead.
      requestId: (req as { id?: string }).id,
      reason: entry.reason ?? req.data?.reason,
      ip: req.ip,
      // Long UA strings are truncated to the schema's cap rather than
      // rejected, so an odd client can't cost us the row.
      userAgent: req.headers['user-agent']?.slice(0, 500),
    });
  }

  /** An authentication event, which may well have no user behind it yet. */
  async recordAuth(
    req: AppRequest,
    data: {
      action: string;
      userId?: Types.ObjectId;
      outcome?: ActivityOutcomeEnum;
      metadata?: Record<string, unknown>;
    },
  ): Promise<void> {
    // A failed login for an unknown identifier has nobody to attribute the row
    // to. Dropping it would hide exactly the pattern this trail is for, so it
    // is attributed to the zero id and stays queryable by action.
    const userId = data.userId ?? new Types.ObjectId('0'.repeat(24));

    await this.recordFromRequest(req, {
      userId,
      action: data.action,
      kind: ActivityKindEnum.AUTH,
      resource: 'Auth',
      outcome: data.outcome ?? ActivityOutcomeEnum.SUCCESS,
      metadata: data.metadata,
    });
  }
}
