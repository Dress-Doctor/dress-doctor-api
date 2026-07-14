import { LeaderLockService, LeaderLockRedis } from './leader-lock.service';

// In-memory Redis honouring exactly the ops the lock uses: SET NX PX and the
// compare-and-delete release eval. Shared by two service instances to model two
// workers racing the same cron tick.
class FakeRedis implements LeaderLockRedis {
  private store = new Map<string, { value: string; expireAt: number }>();

  private live(key: string): { value: string; expireAt: number } | undefined {
    const e = this.store.get(key);
    if (!e) return undefined;
    if (e.expireAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return e;
  }

  set(
    key: string,
    value: string,
    _mode: 'PX',
    ttlMs: number,
    cond: 'NX',
  ): Promise<'OK' | null> {
    if (cond !== 'NX') throw new Error('FakeRedis only supports NX');
    if (this.live(key)) return Promise.resolve(null); // NX: already held
    this.store.set(key, { value, expireAt: Date.now() + ttlMs });
    return Promise.resolve('OK');
  }

  // Models the release script: delete only if the caller still holds the value.
  eval(
    _script: string,
    _numKeys: number,
    key: string,
    value: string,
  ): Promise<number> {
    const e = this.live(key);
    if (e && e.value === value) {
      this.store.delete(key);
      return Promise.resolve(1);
    }
    return Promise.resolve(0);
  }
}

describe('LeaderLockService', () => {
  const KEY = 'cron:test';
  const TTL = 60_000;

  it('elects exactly one owner when two workers race the same tick', async () => {
    const redis = new FakeRedis();
    const workerA = new LeaderLockService(redis);
    const workerB = new LeaderLockService(redis);

    const [a, b] = await Promise.all([
      workerA.acquire(KEY, TTL),
      workerB.acquire(KEY, TTL),
    ]);

    // One and only one worker won.
    expect([a, b].filter(Boolean)).toHaveLength(1);
  });

  it('blocks the loser until the holder releases', async () => {
    const redis = new FakeRedis();
    const holder = new LeaderLockService(redis);
    const other = new LeaderLockService(redis);

    expect(await holder.acquire(KEY, TTL)).toBe(true);
    expect(await other.acquire(KEY, TTL)).toBe(false);

    await holder.release(KEY);
    expect(await other.acquire(KEY, TTL)).toBe(true);
  });

  it('does not let a non-holder release the lock', async () => {
    const redis = new FakeRedis();
    const holder = new LeaderLockService(redis);
    const other = new LeaderLockService(redis);

    expect(await holder.acquire(KEY, TTL)).toBe(true);
    await other.release(KEY); // wrong instance — must be a no-op
    expect(await other.acquire(KEY, TTL)).toBe(false); // still held by holder
  });

  it('withLock runs the fn only for the winner', async () => {
    const redis = new FakeRedis();
    const workerA = new LeaderLockService(redis);
    const workerB = new LeaderLockService(redis);
    const fired: string[] = [];

    await Promise.all([
      workerA.withLock(KEY, TTL, () => {
        fired.push('A');
        return Promise.resolve();
      }),
      workerB.withLock(KEY, TTL, () => {
        fired.push('B');
        return Promise.resolve();
      }),
    ]);

    expect(fired).toHaveLength(1);
  });
});
