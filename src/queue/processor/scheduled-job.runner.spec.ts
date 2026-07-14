import { Job } from 'bullmq';
import { ScheduledJobRunner } from './scheduled-job.runner';
import { AppUtilService } from 'src/helper/service/app-util.service';
import { JobRunService } from 'src/helper/service/job-run.service';
import { FailedJobsService } from 'src/helper/service/failed-jobs.service';
import { ScheduledJobData } from '../queue.dto';

describe('ScheduledJobRunner', () => {
  let jobRun: {
    markProcessing: jest.Mock;
    markCompleted: jest.Mock;
    markFailed: jest.Mock;
  };
  let failedJobs: { record: jest.Mock };
  let runner: ScheduledJobRunner;

  const appUtil = { getLogText: jest.fn().mockReturnValue('') };

  const makeJob = (over: Partial<Job<ScheduledJobData>> = {}) =>
    ({
      name: 'payment-reconcile',
      queueName: 'payment-reconcile',
      id: 'run-1',
      data: { jobRunId: 'run-1' },
      attemptsMade: 1,
      opts: { attempts: 3 },
      ...over,
    }) as Job<ScheduledJobData>;

  beforeEach(() => {
    jobRun = {
      markProcessing: jest.fn().mockResolvedValue(undefined),
      markCompleted: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn().mockResolvedValue(undefined),
    };
    failedJobs = { record: jest.fn().mockResolvedValue(undefined) };
    runner = new ScheduledJobRunner(
      appUtil as unknown as AppUtilService,
      jobRun as unknown as JobRunService,
      failedJobs as unknown as FailedJobsService,
    );
  });

  describe('process', () => {
    it('transitions PROCESSING -> COMPLETED with the work counts', async () => {
      const work = jest.fn().mockResolvedValue({ scanned: 5, changed: 2 });

      await runner.process(makeJob(), work);

      expect(jobRun.markProcessing).toHaveBeenCalledWith('run-1');
      expect(work).toHaveBeenCalled();
      expect(jobRun.markCompleted).toHaveBeenCalledWith('run-1', {
        scanned: 5,
        changed: 2,
      });
    });
  });

  describe('onFailed', () => {
    it('retries silently before attempts are exhausted', async () => {
      const job = makeJob({ attemptsMade: 1, opts: { attempts: 3 } });

      await runner.onFailed(job, new Error('boom'));

      expect(jobRun.markFailed).not.toHaveBeenCalled();
      expect(failedJobs.record).not.toHaveBeenCalled();
    });

    it('marks FAILED and pushes to the failed set on the final attempt', async () => {
      const job = makeJob({ attemptsMade: 3, opts: { attempts: 3 } });

      await runner.onFailed(job, new Error('boom'));

      expect(jobRun.markFailed).toHaveBeenCalledWith('run-1', 'boom', 3);
      expect(failedJobs.record).toHaveBeenCalledWith({
        queue: 'payment-reconcile',
        jobId: 'run-1',
        jobName: 'payment-reconcile',
        error: 'boom',
      });
    });
  });
});
