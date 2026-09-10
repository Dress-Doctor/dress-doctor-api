/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-require-imports */

/**
 * Puts the baseline reference data in place for a suite.
 *
 * These suites used to get it for free: the API seeded itself on start-up, and
 * each one sat in a polling loop waiting for the last row to land. Seeding is
 * now something you ask for, so a suite asks for it and waits properly.
 *
 * `require` rather than a top-level import for the same reason the suites
 * require `AppModule` late — the environment has to be set before the module
 * is loaded.
 */
export async function seedBaseline(app: {
  get: (token: unknown) => { run: () => Promise<void> };
}): Promise<void> {
  const { SeederService } = require('../src/helper/service/seeder.service');
  await app.get(SeederService).run();
}
