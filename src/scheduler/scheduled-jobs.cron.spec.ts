import { ScheduledJobsCron } from './scheduled-jobs.cron';
import { LeaderLockService } from 'src/helper/service/leader-lock.service';
import { JobRunService } from 'src/helper/service/job-run.service';
import { ScheduledJobProducer } from 'src/queue/producer/scheduled-job.producer';
import { Queues } from 'src/queue/queue.dto';

describe('ScheduledJobsCron', () => {
  let leaderLock: { acquire: jest.Mock; id: string };
  let jobRun: {
    createSubmitted: jest.Mock;
    lastCompletedFinishedAt: jest.Mock;
  };
  let producer: {
    enqueuePaymentReconcile: jest.Mock;
    enqueueInactivityScan: jest.Mock;
  };
  let cron: ScheduledJobsCron;

  beforeEach(() => {
    leaderLock = { acquire: jest.fn(), id: 'worker-1' };
    jobRun = {
      createSubmitted: jest.fn().mockResolvedValue({ jobId: 'run-1' }),
      lastCompletedFinishedAt: jest.fn().mockResolvedValue(undefined),
    };
    producer = {
      enqueuePaymentReconcile: jest.fn().mockResolvedValue(undefined),
      enqueueInactivityScan: jest.fn().mockResolvedValue(undefined),
    };
    cron = new ScheduledJobsCron(
      leaderLock as unknown as LeaderLockService,
      jobRun as unknown as JobRunService,
      producer as unknown as ScheduledJobProducer,
    );
  });

  describe('paymentReconcile', () => {
    it('writes exactly one job-run and enqueues once when it wins the lock', async () => {
      leaderLock.acquire.mockResolvedValue(true);

      await cron.paymentReconcile();

      expect(jobRun.createSubmitted).toHaveBeenCalledTimes(1);
      expect(jobRun.createSubmitted).toHaveBeenCalledWith({
        queue: Queues.paymentReconcile,
        jobName: 'payment-reconcile',
        leaderId: 'worker-1',
      });
      expect(producer.enqueuePaymentReconcile).toHaveBeenCalledTimes(1);
      expect(producer.enqueuePaymentReconcile).toHaveBeenCalledWith({
        jobRunId: 'run-1',
        since: undefined,
      });
    });

    it('does nothing when another worker holds the lock', async () => {
      leaderLock.acquire.mockResolvedValue(false);

      await cron.paymentReconcile();

      expect(jobRun.createSubmitted).not.toHaveBeenCalled();
      expect(producer.enqueuePaymentReconcile).not.toHaveBeenCalled();
    });

    it('passes the last-completed watermark as `since`', async () => {
      leaderLock.acquire.mockResolvedValue(true);
      const watermark = new Date('2026-07-14T06:00:00.000Z');
      jobRun.lastCompletedFinishedAt.mockResolvedValue(watermark);

      await cron.paymentReconcile();

      expect(producer.enqueuePaymentReconcile).toHaveBeenCalledWith({
        jobRunId: 'run-1',
        since: watermark.toISOString(),
      });
    });
  });

  describe('inactivityScan', () => {
    it('writes one job-run and enqueues once when leader', async () => {
      leaderLock.acquire.mockResolvedValue(true);

      await cron.inactivityScan();

      expect(jobRun.createSubmitted).toHaveBeenCalledTimes(1);
      expect(producer.enqueueInactivityScan).toHaveBeenCalledTimes(1);
      expect(producer.enqueueInactivityScan).toHaveBeenCalledWith({
        jobRunId: 'run-1',
      });
    });

    it('skips when not leader', async () => {
      leaderLock.acquire.mockResolvedValue(false);

      await cron.inactivityScan();

      expect(jobRun.createSubmitted).not.toHaveBeenCalled();
      expect(producer.enqueueInactivityScan).not.toHaveBeenCalled();
    });
  });
});
