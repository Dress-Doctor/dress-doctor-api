import {
  ProviderMetricsService,
  ProviderMetricsRedis,
} from './provider-metrics.service';

// In-memory counters honouring incrby/mget.
class FakeRedis implements ProviderMetricsRedis {
  store = new Map<string, number>();

  incrby(key: string, by: number): Promise<number> {
    const next = (this.store.get(key) ?? 0) + by;
    this.store.set(key, next);
    return Promise.resolve(next);
  }

  mget(...keys: string[]): Promise<(string | null)[]> {
    return Promise.resolve(
      keys.map((k) => (this.store.has(k) ? String(this.store.get(k)) : null)),
    );
  }
}

describe('ProviderMetricsService', () => {
  let redis: FakeRedis;
  let service: ProviderMetricsService;

  beforeEach(() => {
    redis = new FakeRedis();
    service = new ProviderMetricsService(redis);
  });

  it('accumulates calls, failures, and average latency', async () => {
    await service.recordCall('whatsapp', 100, true);
    await service.recordCall('whatsapp', 200, true);
    await service.recordCall('whatsapp', 300, false);

    const m = await service.read('whatsapp');
    expect(m).toEqual({ calls: 3, failures: 1, avgLatencyMs: 200 });
  });

  it('reads zeros when nothing was recorded', async () => {
    expect(await service.read('whatsapp')).toEqual({
      calls: 0,
      failures: 0,
      avgLatencyMs: 0,
    });
  });

  it('never throws when the metrics write fails', async () => {
    redis.incrby = () => Promise.reject(new Error('redis down'));

    await expect(
      service.recordCall('whatsapp', 100, true),
    ).resolves.toBeUndefined();
  });
});
