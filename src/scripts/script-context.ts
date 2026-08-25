import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { CodeGeneratorService } from '../helper/service/code-generator.service';
import { SchemaModule } from '../schema/schema.module';

/**
 * The database, and nothing else.
 *
 * A migration must NOT boot `AppModule`: its `onModuleInit` kicks the
 * reference seeder off with `void this.seederService.run()` — fire-and-forget,
 * so Nest reports the context ready while the seeder is still writing. A short
 * script then finishes and calls `app.close()` mid-write, which kills the
 * connection under the seeder and throws `MongoClientClosedError`. Booting the
 * schema layer alone sidesteps that, and skips Redis, the queues and i18n,
 * which a migration has no use for either.
 *
 * `ConfigModule` comes first so `.env` is loaded before Mongoose reads
 * `DATABASE_URL`. No validation schema: a migration needs the database URL,
 * not every variable the API server insists on.
 */
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), SchemaModule],
  providers: [CodeGeneratorService],
  exports: [CodeGeneratorService],
})
class ScriptModule {}

/** Boots the schema-only context every backfill script runs against. */
export const createScriptContext = () =>
  NestFactory.createApplicationContext(ScriptModule, {
    logger: ['error', 'warn', 'log'],
  });
