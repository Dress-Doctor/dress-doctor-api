import { flushTestRedis } from './flush-test-redis';

// The run owns its database; hand it back empty.
export default async function globalTeardown(): Promise<void> {
  await flushTestRedis();
}
