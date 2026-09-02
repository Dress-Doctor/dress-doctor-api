import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Queue } from 'bullmq';
import { Queues } from 'src/queue/queue.dto';
import { JobRunService } from 'src/helper/service/job-run.service';
import { FailedJobsService } from 'src/helper/service/failed-jobs.service';
import {
  ProviderMetricsService,
  ProviderMetrics,
} from 'src/helper/metrics/provider-metrics.service';
import { WHATSAPP_PROVIDER_NAME } from 'src/helper/service/whatsapp.provider';
import { SMTP_PROVIDER_NAME } from 'src/helper/service/notification.service';
import { Setting, SettingKeys } from 'src/schema/settings/settings.schema';

// Cron is overdue when the last COMPLETED run is older than ~3 intervals —
// late enough to mean "stopped", not "slightly behind". Defaults; operators
// override via the reconcileOverdueMinutes / inactivityOverdueHours settings.
const DEFAULT_RECONCILE_OVERDUE_MIN = 45; // 15-min cron
const DEFAULT_INACTIVITY_OVERDUE_H = 26; // nightly cron

interface QueueMetrics {
  counts: Record<string, number>;
  failedSetSize: number;
  // Age of the job that has been waiting longest, or null when nothing is
  // waiting. Depth alone can't tell a queue that is briefly busy from one
  // that is stuck — this can.
  oldestWaitingMs: number | null;
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
    @InjectModel(Setting.name) private readonly settingModel: Model<Setting>,
  ) {}

  private async settingValue(key: string, fallback: number): Promise<number> {
    const row = await this.settingModel.findOne({ key, officeId: null }).lean();
    return row?.value ?? fallback;
  }

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
      queues[name] = {
        counts,
        failedSetSize,
        oldestWaitingMs: await this.oldestWaitingMs(queue),
      };
      if (failedSetSize > 0) {
        alerts.push(
          `failed-set: ${name} has ${failedSetSize} exhausted job(s)`,
        );
      }
    }

    const reconcileOverdueS =
      (await this.settingValue(
        SettingKeys.reconcileOverdueMinutes,
        DEFAULT_RECONCILE_OVERDUE_MIN,
      )) * 60;
    const inactivityOverdueS =
      (await this.settingValue(
        SettingKeys.inactivityOverdueHours,
        DEFAULT_INACTIVITY_OVERDUE_H,
      )) *
      60 *
      60;

    const cron: Record<string, CronMetrics> = {
      [Queues.paymentReconcile]: await this.cronMetrics(
        Queues.paymentReconcile,
        reconcileOverdueS,
      ),
      [Queues.inactivityScan]: await this.cronMetrics(
        Queues.inactivityScan,
        inactivityOverdueS,
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

    // SMTP is the channel actually in use, so its failure rate and latency
    // belong beside WhatsApp's rather than only in the log file.
    const smtp = await this.providerMetrics.read(SMTP_PROVIDER_NAME);
    if (smtp.failures > 0) {
      alerts.push(`provider-failures: smtp ${smtp.failures}/${smtp.calls}`);
    }

    return { queues, cron, providers: { whatsapp, smtp }, alerts };
  }

  /** Wait time of the head of the waiting list — FIFO, so the oldest job. */
  private async oldestWaitingMs(queue: Queue): Promise<number | null> {
    const [oldest] = await queue.getWaiting(0, 0);
    if (!oldest?.timestamp) return null;
    return Math.max(0, Date.now() - oldest.timestamp);
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
