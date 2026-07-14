import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Queues } from 'src/queue/queue.dto';
import { JobRunService } from 'src/helper/service/job-run.service';
import { FailedJobsService } from 'src/helper/service/failed-jobs.service';
import {
  ProviderMetricsService,
  ProviderMetrics,
} from 'src/helper/metrics/provider-metrics.service';
import { WHATSAPP_PROVIDER_NAME } from 'src/helper/service/whatsapp.provider';

// Cron is overdue when the last COMPLETED run is older than ~3 intervals —
// late enough to mean "stopped", not "slightly behind".
const RECONCILE_OVERDUE_S = 45 * 60; // 15-min cron
const INACTIVITY_OVERDUE_S = 26 * 60 * 60; // nightly cron

interface QueueMetrics {
  counts: Record<string, number>;
  failedSetSize: number;
}

interface CronMetrics {
  lastCompletedAt: string | null;
  ageSeconds: number | null;
  overdue: boolean;
}

export interface MetricsSnapshot {
  queues: Record<string, QueueMetrics>;
  cron: Record<string, CronMetrics>;
  providers: Record<string, ProviderMetrics>;
  alerts: string[];
}

/**
 * §2.6 observability snapshot: queue depths + outcomes, per-queue failed-set
 * size, cron last-run age, provider call counters — plus an `alerts` array a
 * monitor can string-match on (failed-set growth, cron overdue, provider
 * failures). Read-only aggregation; no state of its own.
 */
@Injectable()
export class MetricsService {
  constructor(
    @InjectQueue(Queues.notification)
    private readonly notificationQueue: Queue,
    @InjectQueue(Queues.inactivityScan)
    private readonly inactivityQueue: Queue,
    @InjectQueue(Queues.paymentReconcile)
    private readonly reconcileQueue: Queue,
    private readonly jobRun: JobRunService,
    private readonly failedJobs: FailedJobsService,
    private readonly providerMetrics: ProviderMetricsService,
  ) {}

  async snapshot(): Promise<MetricsSnapshot> {
    const alerts: string[] = [];

    const queues: Record<string, QueueMetrics> = {};
    const queuePairs: [Queues, Queue][] = [
      [Queues.notification, this.notificationQueue],
      [Queues.inactivityScan, this.inactivityQueue],
      [Queues.paymentReconcile, this.reconcileQueue],
    ];
    for (const [name, queue] of queuePairs) {
      const counts = await queue.getJobCounts(
        'waiting',
        'active',
        'completed',
        'failed',
        'delayed',
      );
      const failedSetSize = await this.failedJobs.size(name);
      queues[name] = { counts, failedSetSize };
      if (failedSetSize > 0) {
        alerts.push(
          `failed-set: ${name} has ${failedSetSize} exhausted job(s)`,
        );
      }
    }

    const cron: Record<string, CronMetrics> = {
      [Queues.paymentReconcile]: await this.cronMetrics(
        Queues.paymentReconcile,
        RECONCILE_OVERDUE_S,
      ),
      [Queues.inactivityScan]: await this.cronMetrics(
        Queues.inactivityScan,
        INACTIVITY_OVERDUE_S,
      ),
    };
    for (const [name, m] of Object.entries(cron)) {
      if (m.overdue) alerts.push(`cron-overdue: ${name} (${m.ageSeconds}s)`);
    }

    const whatsapp = await this.providerMetrics.read(WHATSAPP_PROVIDER_NAME);
    if (whatsapp.failures > 0) {
      alerts.push(
        `provider-failures: whatsapp ${whatsapp.failures}/${whatsapp.calls}`,
      );
    }

    return { queues, cron, providers: { whatsapp }, alerts };
  }

  private async cronMetrics(
    queue: Queues,
    overdueSeconds: number,
  ): Promise<CronMetrics> {
    const last = await this.jobRun.lastCompletedFinishedAt(queue);
    if (!last) {
      // Never completed: not overdue on a fresh deploy — depth/failed-set
      // metrics surface a stuck queue instead.
      return { lastCompletedAt: null, ageSeconds: null, overdue: false };
    }
    const ageSeconds = Math.round((Date.now() - last.getTime()) / 1000);
    return {
      lastCompletedAt: last.toISOString(),
      ageSeconds,
      overdue: ageSeconds > overdueSeconds,
    };
  }
}
