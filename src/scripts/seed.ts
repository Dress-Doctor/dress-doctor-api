/**
 * Seeds the baseline data — the one and only way to do it.
 *
 *     npm run seed
 *
 * Safe to run as often as you like. It creates what is missing and leaves
 * everything else exactly as it is: a description somebody reworded, a price
 * somebody corrected, a category somebody renamed all stay as they were. A row
 * that needs nothing is not written to at all, so its "last updated" does not
 * move either.
 *
 * This used to run by itself every time the API started, which is how edits
 * made in the panel kept going back to the seed text overnight.
 *
 * One switch, off unless you set it:
 *
 *   SEED_RECONCILE_PERMISSIONS=YES   make the seed's role map the final word,
 *                                    removing permissions it no longer lists
 *
 * Read the note on `seedRolePermissions` before using it: the permissions
 * matrix in the panel is a real screen, and that switch overrules whatever was
 * saved there.
 */
import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { RedisModule } from '../helper/redis/redis.module';
import { CodeGeneratorService } from '../helper/service/code-generator.service';
import { LeaderLockService } from '../helper/service/leader-lock.service';
import { SeederService } from '../helper/service/seeder.service';
import { SchemaModule } from '../schema/schema.module';

/**
 * The database, Redis and the seeder. Not the API.
 *
 * Redis is here for one reason: the leader lock. Two deploys landing together,
 * or a job that restarts, must not seed side by side — the reference
 * generators check the database for a clash before picking a code, and two
 * runs can pick the same one before either has saved.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    SchemaModule,
    RedisModule,
  ],
  providers: [CodeGeneratorService, LeaderLockService, SeederService],
})
class SeedModule {}

async function main() {
  const logger = new Logger('Seed');
  const app = await NestFactory.createApplicationContext(SeedModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    await app.get(SeederService).run();
  } finally {
    // Awaited, unlike the old fire-and-forget call: closing the context while
    // the seeder is still writing kills the connection under it.
    await app.close();
  }

  logger.log('Done.');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    // Loud and non-zero. A half-finished seed that looks like a success is
    // worse than one that stops the deploy.
    console.error('Seeding failed:', error);
    process.exit(1);
  });
