import { randomUUID } from 'crypto';

/**
 * A `reference` for a user a suite creates directly.
 *
 * Every account is addressed by its reference — the field is required, and the
 * live sign-up path mints one — so a fixture that pokes a `User` straight into
 * the database has to supply one too. Random rather than sequential: suites
 * run in one process and share nothing, so a counter would be the only thing
 * that could collide.
 */
export const testUserReference = (): string =>
  `US-${randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase()}`;
