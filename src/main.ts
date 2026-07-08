import {
  ConsoleLogger,
  Logger,
  RequestMethod,
  VersioningType,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import swaggerConfig from './config/swagger.config';
import { HTTPExceptionFilter } from './helper/exception-filters/http.exception-filter';
import { HTTPResponseInterceptor } from './helper/interceptor/http.interceptor';
import { AppValidationPipe } from './helper/pipe/app-validation.pipe';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: new ConsoleLogger({ prefix: 'Dress Doctor', json: true }),
  });

  // Cors
  app.enableCors({
    credentials: true,
    methods: 'GET, HEAD, PUT, POST',
    origin: ['http://localhost:5173', 'http://localhost:3000'],
  });

  // API Versioning
  app.setGlobalPrefix('api', {
    exclude: [{ path: 'o/*path', method: RequestMethod.GET }],
  });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // HTTP Interceptor / Exception Filter
  app.useGlobalFilters(new HTTPExceptionFilter());
  app.useGlobalInterceptors(new HTTPResponseInterceptor());

  // Handle Class-Validation Errors
  app.useGlobalPipes(AppValidationPipe);

  // Swagger Documentation
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/docs/json',
  });

  const PORT = process.env.PORT ?? 3000;
  await app.listen(PORT, () => {
    const logger = new Logger('Bootstrap');
    logger.log(`Service running on http://localhost:${PORT}`);
    logger.log(`API Documentation: http://localhost:${PORT}/api/docs`);
    logger.log(`JSON Documentation: http://localhost:${PORT}/api/docs/json`);
  });
}

bootstrap().catch((err) => console.error(err));
