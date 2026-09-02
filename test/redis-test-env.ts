/**
 * Redis namespace for the e2e suites.
 *
 * Two rules, both enforced here rather than restated per spec:
 *
 * 1. A suite gets a STABLE name (`<suite>-e2e`), never a timestamped one. A
 *    timestamp made every run mint a fresh BullMQ prefix that nothing ever
 *    deleted, so the instance accumulated one dead namespace per run.
 *    Suite names are already unique, so parallel workers still don't collide.
 * 2. Everything runs on its own logical database, wiped around the run by
 *    test/jest-global-setup.ts and test/jest-global-teardown.ts. Test keys
 *    therefore cannot land beside dev or stage data even on a shared host.
 */

/** Logical database the e2e suites own outright — it gets flushed. */
export const TEST_REDIS_DB: number = 15;

/**
 * Redis env for one suite. Spread into the spec's `Object.assign(process.env, …)`.
 *
 * @param suite short kebab-case suite id, e.g. 'rewards' → root `dd-rewards-e2e`
 */
export const redisTestEnv = (suite: string): Record<string, string> => {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(suite)) {
    throw new Error(`e2e suite id must be kebab-case, got "${suite}"`);
  }
  if (/stage|prod/.test(suite)) {
    throw new Error(
      `e2e suite id must not name a real environment: "${suite}"`,
    );
  }
  return {
    REDIS_HOST: process.env.REDIS_HOST ?? '127.0.0.1',
    REDIS_PORT: process.env.REDIS_PORT ?? '6379',
    REDIS_NAME: `${suite}-e2e`,
    REDIS_DB: String(TEST_REDIS_DB),
  };
};
