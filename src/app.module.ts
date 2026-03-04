import {
  Logger,
  MiddlewareConsumer,
  Module,
  NestModule,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, ConnectionStates } from 'mongoose';
import { OfficeLinkModule } from './api/office-link/office-link.module';
import { PickupModule } from './api/pickup/pickup.module';
import { LogRequestMiddleware } from './helper/middleware/log-request.middleware';
import { CodeGeneratorService } from './helper/service/code-generator.service';
import { SeederService } from './helper/service/seeder.service';
import { i18nModule } from './i18n/i18n.module';
import { SchemaModule } from './schema/schema.module';
import { ApiClientModule } from './api/api-client/api-client.module';
import { AuthModule } from './api/auth/auth.module';
import { APP_GUARD } from '@nestjs/core';
import { ApiClientGuard } from './helper/guard/api-client.guard';
import { UtilModule } from './api/util/util.module';
import { UserModule } from './api/user/user.module';
import { OrderModule } from './api/order/order.module';

@Module({
  imports: [
    i18nModule,
    AuthModule,
    SchemaModule,
    PickupModule,
    OfficeLinkModule,
    ApiClientModule,
    ConfigModule.forRoot({ isGlobal: true }),
    UtilModule,
    UserModule,
    OrderModule,
  ],
  providers: [
    SeederService,
    CodeGeneratorService,
    { provide: APP_GUARD, useClass: ApiClientGuard },
  ],
})
export class AppModule implements NestModule, OnModuleInit {
  private readonly logger = new Logger(AppModule.name);
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly seederService: SeederService,
  ) {}

  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LogRequestMiddleware).forRoutes('*path');
  }

  async onModuleInit() {
    try {
      if (this.connection.readyState === ConnectionStates.connected) {
        this.logger.log('✅ MongoDB connected');
        // await this.seederService.run();
      } else this.logger.log('❌ Failed to connect to MongoDB');
    } catch (error) {
      this.logger.error('❌ Failed to connect to MongoDB', error);
      process.exit(1); // Stop the server
    }
  }
}
