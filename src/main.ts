import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, VersioningType } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Cors
  app.enableCors({
    Credential: true,
    methods: 'GET, HEAD, PUT, POST',
    origin: ['http://localhost:5173', 'http://localhost:3000'],
  });

  // API Versioning
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  const PORT = process.env.PORT ?? 3000;
  await app.listen(PORT, () => {
    const logger = new Logger('Bootstrap');
    logger.log(`Service running on http://localhost:${PORT}`);
  });
}

bootstrap().catch((err) => console.error(err));
