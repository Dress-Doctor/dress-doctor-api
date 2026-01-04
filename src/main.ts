import { ConsoleLogger, Logger, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { HTTPExceptionFilter } from './helper/exception-filters/http.exception-filter';
import { HTTPResponseInterceptor } from './helper/interceptor/http.interceptor';
import { AppValidationPipe } from './helper/pipe/app-validation.pipe';
import { SwaggerModule } from '@nestjs/swagger';
import swaggerConfig from './config/swagger.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: new ConsoleLogger({ prefix: 'Dress Doctor' }),
  });

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

  // Handle Class-Validation Errors
  app.useGlobalPipes(AppValidationPipe);

  // Swagger Documentation
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const PORT = process.env.PORT ?? 3000;
  await app.listen(PORT, () => {
    const logger = new Logger('Bootstrap');
    logger.log(`Service running on http://localhost:${PORT}`);
    logger.log(`API Documentation: http://localhost:${PORT}/api/docs`);
  });
}

bootstrap().catch((err) => console.error(err));
