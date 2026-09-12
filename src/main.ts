import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp, corsOptions } from './config/app-setup';
import swaggerConfig from './config/swagger.config';
import { FileLoggerService } from './helper/service/file-logger.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // rawBody so the WhatsApp status webhook can verify its HMAC signature.
    rawBody: true,
    logger: new FileLoggerService({
      filePrefix: 'api-',
      prefix: 'Dress Doctor',
    }),
  });

  // Cookie parsing, prefix, versioning, envelope — shared with the e2e specs
  // so tests exercise the same app shape production serves.
  configureApp(app);
  app.enableCors(corsOptions());

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
