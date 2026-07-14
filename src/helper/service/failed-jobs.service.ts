import { Inject, Injectable, Logger } from '@nestjs/common';
import { REDIS_CLIENT } from '../redis/redis.module';

// Minimal ioredis slice: a per-queue failed set (sorted by failure time) plus a
// counter. Keeps exhausted-retry jobs visible for observability/alerting instead
// of BullMQ silently dropping them (defaultJobOptions.removeOnFail is true).
export interface FailedJobsRedis {
  zadd(key: string, score: number, member: string): Promise<number>;
  zcard(key: string): Promise<number>;
  incr(key: string): Promise<number>;
}

@Injectable()
export class FailedJobsService {
  private readonly logger = new Logger(FailedJobsService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: FailedJobsRedis) {}

  private setKey(queue: string): string {
    return `failed:${queue}`;
  }

  private counterKey(queue: string): string {
    return `failed:${queue}:count`;
  }

  /** Record a job that exhausted its retries. Never throws — best-effort. */
  async record(input: {
    queue: string;
    jobId: string;
    jobName: string;
    error: string;
  }): Promise<void> {
    const member = JSON.stringify({
      jobId: input.jobId,
      jobName: input.jobName,
      error: input.error,
      at: new Date().toISOString(),
    });
    try {
      await this.redis.zadd(this.setKey(input.queue), Date.now(), member);
      await this.redis.incr(this.counterKey(input.queue));
      this.logger.error(
        `Job ${input.jobName}:${input.jobId} moved to failed set for ${input.queue}`,
      );
    } catch (err) {
      this.logger.error(
        `Failed-set write failed for ${input.queue}: ${(err as Error).message}`,
      );
    }
  }

  /** Current failed-set depth for a queue (observability, §2.6). */
  async size(queue: string): Promise<number> {
    return this.redis.zcard(this.setKey(queue));
  }
}
