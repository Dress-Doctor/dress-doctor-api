import { flushTestRedis } from './flush-test-redis';

// Clear anything a previously crashed run left behind before the suites start.
export default async function globalSetup(): Promise<void> {
  await flushTestRedis();
}
