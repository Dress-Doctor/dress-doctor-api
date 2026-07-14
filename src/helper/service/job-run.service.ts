import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JobRun } from 'src/schema/job-run/job-run.schema';
import { JobRunStatusEnum } from 'src/schema/job-run/job-run.dto';
import { Queues } from 'src/queue/queue.dto';

// Writes and transitions the JobRun audit row. The cron creates it (SUBMITTED)
// and the processor moves it PROCESSING -> COMPLETED/FAILED, keyed by the same
// id (which is also the BullMQ jobId), so there is exactly one row per run.
@Injectable()
export class JobRunService {
  constructor(
    @InjectModel(JobRun.name) private readonly jobRunModel: Model<JobRun>,
  ) {}

  /** Create the run row at dispatch; its _id doubles as the BullMQ jobId. */
  async createSubmitted(input: {
    queue: Queues;
    jobName: string;
    leaderId: string;
  }): Promise<JobRun> {
    const doc = new this.jobRunModel({
      queue: input.queue,
      jobName: input.jobName,
      leaderId: input.leaderId,
      status: JobRunStatusEnum.SUBMITTED,
      dispatchedAt: new Date(),
      counts: {},
    });
    doc.jobId = doc._id.toString();
    return doc.save();
  }

  async markProcessing(jobRunId: string): Promise<void> {
    await this.jobRunModel.updateOne(
      { _id: jobRunId },
      { $set: { status: JobRunStatusEnum.PROCESSING, startedAt: new Date() } },
    );
  }

  async markCompleted(
    jobRunId: string,
    counts: Record<string, number>,
  ): Promise<void> {
    await this.jobRunModel.updateOne(
      { _id: jobRunId },
      {
        $set: {
          status: JobRunStatusEnum.COMPLETED,
          finishedAt: new Date(),
          counts,
        },
      },
    );
  }

  async markFailed(
    jobRunId: string,
    error: string,
    attemptsMade: number,
  ): Promise<void> {
    await this.jobRunModel.updateOne(
      { _id: jobRunId },
      {
        $set: {
          status: JobRunStatusEnum.FAILED,
          finishedAt: new Date(),
          error,
          attemptsMade,
        },
      },
    );
  }

  /** finishedAt of the last COMPLETED run for a queue — the reconcile watermark. */
  async lastCompletedFinishedAt(queue: Queues): Promise<Date | undefined> {
    const last = await this.jobRunModel
      .findOne({ queue, status: JobRunStatusEnum.COMPLETED })
      .sort({ finishedAt: -1 })
      .select('finishedAt')
      .lean();
    return last?.finishedAt;
  }
}
