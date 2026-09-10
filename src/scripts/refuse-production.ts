/**
 * Refuses to run anywhere that looks like production.
 *
 * This script invents customers, orders and payments. On a real database that
 * is not a test fixture, it is fake trade sitting in the books — and nothing
 * about the rows says they were made up. `NODE_ENV` is the first check; the
 * database name is the second, because an operator running this by hand on a
 * laptop usually has `NODE_ENV` unset while pointing `DATABASE_URL` at
 * something they did not mean to touch.
 *
 * `ALLOW_TEST_SEED=YES` is the deliberate override, for the rare case of a
 * shared staging database whose name happens to read like a live one.
 *
 * Returns the reason to refuse, or `null` to carry on. The caller decides what
 * to do about it; keeping `process.exit` out of here is what makes it testable.
 */
export function productionRefusal(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  if (env.ALLOW_TEST_SEED === 'YES') return null;

  const nodeEnv = env.NODE_ENV ?? '';
  if (nodeEnv === 'production' || nodeEnv === 'prod') {
    return `NODE_ENV is "${nodeEnv}". This script writes made-up customers, orders and payments, so it will not run here.`;
  }

  const url = env.DATABASE_URL ?? '';
  // The database name is the last path segment, before any query string.
  const name = url.split('?')[0].split('/').pop() ?? '';
  if (/prod|live/i.test(name)) {
    return (
      `DATABASE_URL points at "${name}", which reads like a live database. This script writes made-up customers, orders and payments, so it will not run here. ` +
      'If that is genuinely a test database, re-run with ALLOW_TEST_SEED=YES.'
    );
  }

  return null;
}
