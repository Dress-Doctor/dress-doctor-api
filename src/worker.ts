import { ConsoleLogger, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: new ConsoleLogger({ prefix: 'Dress Doctor Worker', json: true }),
  });

  const logger = new Logger('Worker');
  logger.log('Worker started: queue processors + cron running, no HTTP');

  const shutdown = async (signal: string) => {
    logger.log(`Received ${signal}, shutting down worker`);
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

bootstrap().catch((err) => console.error(err));
