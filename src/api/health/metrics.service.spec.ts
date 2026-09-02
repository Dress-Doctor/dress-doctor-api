import { Queue } from 'bullmq';
import { Model } from 'mongoose';
import { Setting } from 'src/schema/settings/settings.schema';
import { JobRunService } from 'src/helper/service/job-run.service';
import { FailedJobsService } from 'src/helper/service/failed-jobs.service';
import { ProviderMetricsService } from 'src/helper/metrics/provider-metrics.service';
import { MetricsService } from './metrics.service';

describe('MetricsService', () => {
  let service: MetricsService;
  let lastCompletedFinishedAt: jest.Mock;
  let failedSize: jest.Mock;
  let providerRead: jest.Mock;

  const makeQueue = (waiting: { timestamp: number }[] = []) =>
    ({
      getJobCounts: jest.fn().mockResolvedValue({
        waiting: waiting.length,
        active: 0,
        completed: 5,
        failed: 0,
        delayed: 0,
      }),
      getWaiting: jest.fn().mockResolvedValue(waiting),
    }) as unknown as Queue;

  beforeEach(() => {
    lastCompletedFinishedAt = jest.fn().mockResolvedValue(new Date());
    failedSize = jest.fn().mockResolvedValue(0);
    providerRead = jest
      .fn()
      .mockResolvedValue({ calls: 10, failures: 0, avgLatencyMs: 120 });

    // No settings rows — default thresholds (45 min / 26 h) apply.
    const settingModel = {
      findOne: jest.fn(() => ({ lean: () => Promise.resolve(null) })),
    };

    service = new MetricsService(
      makeQueue(),
      makeQueue(),
      makeQueue(),
      { lastCompletedFinishedAt } as unknown as JobRunService,
      { size: failedSize } as unknown as FailedJobsService,
      { read: providerRead } as unknown as ProviderMetricsService,
      settingModel as unknown as Model<Setting>,
    );
  });

  it('reports queues, cron ages, and provider counters with no alerts when healthy', async () => {
    const snap = await service.snapshot();

    expect(Object.keys(snap.queues)).toEqual([
      'notification',
      'inactivity-scan',
      'payment-reconcile',
    ]);
    expect(snap.queues['notification'].counts.completed).toBe(5);
    expect(snap.cron['payment-reconcile'].overdue).toBe(false);
    expect(snap.providers.whatsapp.calls).toBe(10);
    expect(snap.alerts).toEqual([]);
  });

  it('alerts on failed-set growth', async () => {
    failedSize.mockResolvedValue(3);

    const snap = await service.snapshot();

    expect(snap.queues['notification'].failedSetSize).toBe(3);
    expect(snap.alerts.some((a) => a.startsWith('failed-set:'))).toBe(true);
  });

  it('alerts when the reconcile cron is overdue (>45 min)', async () => {
    lastCompletedFinishedAt.mockResolvedValue(
      new Date(Date.now() - 60 * 60 * 1000), // 1h ago
    );

    const snap = await service.snapshot();

    expect(snap.cron['payment-reconcile'].overdue).toBe(true);
    expect(
      snap.alerts.some((a) => a.includes('cron-overdue: payment-reconcile')),
    ).toBe(true);
    // 1h is NOT overdue for the nightly scan (26h threshold).
    expect(snap.cron['inactivity-scan'].overdue).toBe(false);
  });

  it('does not flag a never-run cron as overdue (fresh deploy)', async () => {
    lastCompletedFinishedAt.mockResolvedValue(undefined);

    const snap = await service.snapshot();

    expect(snap.cron['payment-reconcile']).toEqual({
      lastCompletedAt: null,
      ageSeconds: null,
      overdue: false,
    });
    expect(snap.alerts).toEqual([]);
  });

  it('honours setting-overridden overdue thresholds', async () => {
    // reconcileOverdueMinutes = 10 → a 30-min-old run is overdue.
    const settingModel = {
      findOne: jest.fn((filter: { key: string }) => ({
        lean: () =>
          Promise.resolve(
            filter.key === 'reconcileOverdueMinutes' ? { value: 10 } : null,
          ),
      })),
    };
    lastCompletedFinishedAt.mockResolvedValue(
      new Date(Date.now() - 30 * 60 * 1000),
    );
    service = new MetricsService(
      makeQueue(),
      makeQueue(),
      makeQueue(),
      { lastCompletedFinishedAt } as unknown as JobRunService,
      { size: failedSize } as unknown as FailedJobsService,
      { read: providerRead } as unknown as ProviderMetricsService,
      settingModel as unknown as Model<Setting>,
    );

    const snap = await service.snapshot();

    expect(snap.cron['payment-reconcile'].overdue).toBe(true);
  });

  it('alerts on provider failures', async () => {
    providerRead.mockResolvedValue({
      calls: 10,
      failures: 4,
      avgLatencyMs: 300,
    });

    const snap = await service.snapshot();

    expect(
      snap.alerts.some((a) => a.includes('provider-failures: whatsapp 4/10')),
    ).toBe(true);
  });
});
