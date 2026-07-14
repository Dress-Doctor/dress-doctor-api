// Lifecycle of a single scheduled/queued run, mirrored from the queue stage log
// so "did this cron fire, and what did it do" is answerable from the DB.
export enum JobRunStatusEnum {
  SUBMITTED = 'SUBMITTED',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}
