import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { LogRequestMiddleware } from './helper/middleware/log-request.middleware';
import { i18nModule } from './i18n/i18n.module';
import { SchemaModule } from './schema/schema.module';

@Module({
  imports: [i18nModule, SchemaModule, ConfigModule.forRoot({ isGlobal: true })],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LogRequestMiddleware).forRoutes('*path');
  }
}
