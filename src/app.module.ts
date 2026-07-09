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
import { HealthModule } from './api/health/health.module';
import { OfficeLinkModule } from './api/office-link/office-link.module';
import { PickupModule } from './api/pickup/pickup.module';
import { CorrelationIdMiddleware } from './helper/middleware/correlation-id.middleware';
import { LogRequestMiddleware } from './helper/middleware/log-request.middleware';
import { ApiClientLookupService } from './helper/service/api-client-lookup.service';
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
import { PaymentModule } from './api/payment/payment.module';
import { BullModule } from '@nestjs/bullmq';
import { QueueProcessorModule } from './queue/queue-processor.module';
import { envValidationSchema } from './config/env.validation';

@Module({
  imports: [
    i18nModule,
    AuthModule,
    SchemaModule,
    PickupModule,
    OfficeLinkModule,
    HealthModule,
    ApiClientModule,
    UtilModule,
    UserModule,
    OrderModule,
    PaymentModule,
    QueueProcessorModule,
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
      validationOptions: { abortEarly: false },
    }),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST,
        port: Number(process.env.REDIS_PORT),
      },
      prefix: `dress-doctor-${process.env.REDIS_NAME}`,
      defaultJobOptions: {
        attempts: 3,
        removeOnFail: true,
        removeOnComplete: {
          age: 3600, // keep for 1 hour
          count: 1000,
        },
        backoff: { type: 'exponential', delay: 2000 },
      },
    }),
  ],
  providers: [
    SeederService,
    CodeGeneratorService,
    ApiClientLookupService,
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
    consumer
      .apply(CorrelationIdMiddleware, LogRequestMiddleware)
      .forRoutes('*path');
  }

  onModuleInit() {
    try {
      if (this.connection.readyState === ConnectionStates.connected) {
        this.logger.log('✅ MongoDB connected');
        void this.seederService.run();
      } else this.logger.log('❌ Failed to connect to MongoDB');
    } catch (error) {
      this.logger.error('❌ Failed to connect to MongoDB', error);
      process.exit(1); // Stop the server
    }
  }
}
