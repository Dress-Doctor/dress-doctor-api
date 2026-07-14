import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { AppUtilService } from 'src/helper/service/app-util.service';
import { JobRunService } from 'src/helper/service/job-run.service';
import { FailedJobsService } from 'src/helper/service/failed-jobs.service';
import { ScheduledJobData } from '../queue.dto';

// Shared lifecycle for scheduled-queue processors so each processor only writes
// its domain work. Handles the SUBMITTED->PROCESSING->COMPLETED/FAILED stage log
// + JobRun transitions, and routes exhausted-retry jobs to the failed set.
@Injectable()
export class ScheduledJobRunner {
  private readonly logger = new Logger(ScheduledJobRunner.name);

  constructor(
    private readonly appUtil: AppUtilService,
    private readonly jobRun: JobRunService,
    private readonly failedJobs: FailedJobsService,
  ) {}

  /** PROCESSING -> run domain `work` -> COMPLETED, updating the JobRun row. */
  async process(
    job: Job<ScheduledJobData>,
    work: (data: ScheduledJobData) => Promise<Record<string, number>>,
  ): Promise<void> {
    this.logger.log(
      this.appUtil.getLogText({
        STATUS: 'PROCESSING',
        JOB_NAME: job.name,
        QUEUE_NAME: job.queueName,
        JOB_RUN_ID: job.data.jobRunId,
      }),
    );
    await this.jobRun.markProcessing(job.data.jobRunId);
    const counts = await work(job.data);
    await this.jobRun.markCompleted(job.data.jobRunId, counts);
    this.logger.log(
      this.appUtil.getLogText({
        STATUS: 'COMPLETED',
        JOB_NAME: job.name,
        QUEUE_NAME: job.queueName,
        JOB_RUN_ID: job.data.jobRunId,
        COUNTS: JSON.stringify(counts),
      }),
    );
  }

  /**
   * Failure handler. BullMQ fires 'failed' on every attempt; only on the final
   * attempt do we mark the JobRun FAILED and push to the failed set — earlier
   * failures are retried under the global backoff and stay PROCESSING.
   */
  async onFailed(job: Job<ScheduledJobData>, err: Error): Promise<void> {
    const maxAttempts = job.opts.attempts ?? 1;
    const exhausted = job.attemptsMade >= maxAttempts;
    this.logger.error(
      this.appUtil.getLogText({
        STATUS: exhausted ? 'FAILED' : 'RETRY',
        JOB_NAME: job.name,
        QUEUE_NAME: job.queueName,
        JOB_RUN_ID: job.data.jobRunId,
        ATTEMPT: `${job.attemptsMade}/${maxAttempts}`,
      }),
    );
    this.logger.error(err.message, err.stack);
    if (!exhausted) return;

    await this.jobRun.markFailed(
      job.data.jobRunId,
      err.message,
      job.attemptsMade,
    );
    await this.failedJobs.record({
      queue: job.queueName,
      jobId: job.id ?? job.data.jobRunId,
      jobName: job.name,
      error: err.message,
    });
  }
}
