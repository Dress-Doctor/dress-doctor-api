import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { JobRunStatusEnum } from './job-run.dto';

// One row per scheduled/queued run. The cron creates it (SUBMITTED) at enqueue,
// keyed by the BullMQ jobId; the processor finds it by jobId and transitions it
// PROCESSING -> COMPLETED/FAILED, filling `counts`. Auditable trail of every run.
@Schema({ timestamps: true, collection: 'job_run' })
export class JobRun extends Document<Types.ObjectId> {
  // Queue the run belongs to (queue.dto Queues value).
  @Prop({ required: true })
  queue: string;

  // Bull job name.
  @Prop({ required: true })
  jobName: string;

  // BullMQ job id — the key the processor matches on to update this same row.
  @Prop({ required: true })
  jobId: string;

  @Prop({ required: true, type: String, enum: JobRunStatusEnum })
  status: JobRunStatusEnum;

  // Worker instance that won the leader lock and dispatched this run.
  @Prop({ required: false })
  leaderId?: string;

  // When the cron enqueued the job.
  @Prop({ required: true })
  dispatchedAt: Date;

  // When the processor picked it up.
  @Prop({ required: false })
  startedAt?: Date;

  // When the processor completed or failed it.
  @Prop({ required: false })
  finishedAt?: Date;

  // Domain counts the processor reports (e.g. { scanned, reconciled, changed }).
  @Prop({ required: false, type: Object, default: {} })
  counts?: Record<string, number>;

  // Failure message on the terminal FAILED transition (never secrets/PII).
  @Prop({ required: false })
  error?: string;

  // Bull attemptsMade at the terminal transition.
  @Prop({ required: false })
  attemptsMade?: number;
}

export const JobRunSchema = SchemaFactory.createForClass(JobRun);
// One run per jobId; also the update key from the processor.
JobRunSchema.index({ jobId: 1 }, { unique: true });
// List path: recent runs per queue (observability, cron last-run age).
JobRunSchema.index({ queue: 1, dispatchedAt: -1 });
