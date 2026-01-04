import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, VersioningType } from '@nestjs/common';
import { HTTPExceptionFilter } from './helper/exception-filters/http.exception-filter';
import { HTTPResponseInterceptor } from './helper/interceptor/http.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Cors
  app.enableCors({
    credentials: true,
    methods: 'GET, HEAD, PUT, POST',
    origin: ['http://localhost:5173', 'http://localhost:3000'],
  });

  // API Versioning
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // HTTP Interceptor / Exception Filter
  app.useGlobalFilters(new HTTPExceptionFilter());
  app.useGlobalInterceptors(new HTTPResponseInterceptor());

  const PORT = process.env.PORT ?? 3000;
  await app.listen(PORT, () => {
    const logger = new Logger('Bootstrap');
    logger.log(`Service running on http://localhost:${PORT}`);
  });
}

bootstrap().catch((err) => console.error(err));
