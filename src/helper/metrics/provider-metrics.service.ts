import { Inject, Injectable, Logger } from '@nestjs/common';
import { REDIS_CLIENT } from '../redis/redis.module';

// Minimal ioredis slice for the metrics counters.
export interface ProviderMetricsRedis {
  incrby(key: string, by: number): Promise<number>;
  mget(...keys: string[]): Promise<(string | null)[]>;
}

export interface ProviderMetrics {
  calls: number;
  failures: number;
  avgLatencyMs: number;
}

/**
 * Cumulative per-provider call counters (§2.6): calls, failures, total latency.
 * Written by the providers on every real API call, read by GET /metrics.
 * Best-effort — a metrics write must never fail a send.
 */
@Injectable()
export class ProviderMetricsService {
  private readonly logger = new Logger(ProviderMetricsService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: ProviderMetricsRedis,
  ) {}

  private key(provider: string, metric: string): string {
    return `metrics:provider:${provider}:${metric}`;
  }

  async recordCall(
    provider: string,
    latencyMs: number,
    ok: boolean,
  ): Promise<void> {
    try {
      await this.redis.incrby(this.key(provider, 'calls'), 1);
      await this.redis.incrby(
        this.key(provider, 'totalMs'),
        Math.round(latencyMs),
      );
      if (!ok) await this.redis.incrby(this.key(provider, 'failures'), 1);
    } catch (err) {
      this.logger.warn(
        `provider metrics write failed (${provider}): ${(err as Error).message}`,
      );
    }
  }

  async read(provider: string): Promise<ProviderMetrics> {
    const [calls, failures, totalMs] = await this.redis.mget(
      this.key(provider, 'calls'),
      this.key(provider, 'failures'),
      this.key(provider, 'totalMs'),
    );
    const callCount = Number(calls ?? 0);
    return {
      calls: callCount,
      failures: Number(failures ?? 0),
      avgLatencyMs:
        callCount > 0 ? Math.round(Number(totalMs ?? 0) / callCount) : 0,
    };
  }
}
