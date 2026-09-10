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
import { HistoryLabelModule } from './helper/service/history-label.module';
import { SeederService } from './helper/service/seeder.service';
import { i18nModule } from './i18n/i18n.module';
import { SchemaModule } from './schema/schema.module';
import { ApiClientModule } from './api/api-client/api-client.module';
import { AuthModule } from './api/auth/auth.module';
import { APP_GUARD } from '@nestjs/core';
import { ApiClientGuard } from './helper/guard/api-client.guard';
import { ChangeReasonGuard } from './helper/guard/change-reason.guard';
import { CatalogueModule } from './api/catalogue/catalogue.module';
import { RoleModule } from './api/role/role.module';
import { UtilModule } from './api/util/util.module';
import { UserModule } from './api/user/user.module';
import { CustomerModule } from './api/customer/customer.module';
import { OfficeModule } from './api/office/office.module';
import { WebhookModule } from './api/webhook/webhook.module';
import { PricingModule } from './api/pricing/pricing.module';
import { OrderModule } from './api/order/order.module';
import { PaymentModule } from './api/payment/payment.module';
import { FollowUpModule } from './api/follow-up/follow-up.module';
import { RewardModule } from './api/reward/reward.module';
import { SubscriptionModule } from './api/subscription/subscription.module';
import { EventsModule } from './events/events.module';
import { MetricsModule } from './helper/metrics/metrics.module';
import { ActivityRecorderModule } from './helper/activity/activity.module';
import { ActivityModule } from './api/activity/activity.module';
import { BullModule } from '@nestjs/bullmq';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { envValidationSchema } from './config/env.validation';
import { bullPrefix, redisConnection } from './config/redis.config';

@Module({
  imports: [
    i18nModule,
    EventEmitterModule.forRoot(),
    AuthModule,
    SchemaModule,
    HistoryLabelModule,
    PickupModule,
    OfficeLinkModule,
    HealthModule,
    ApiClientModule,
    UtilModule,
    CatalogueModule,
    RoleModule,
    UserModule,
    CustomerModule,
    OfficeModule,
    WebhookModule,
    PricingModule,
    OrderModule,
    PaymentModule,
    FollowUpModule,
    RewardModule,
    SubscriptionModule,
    EventsModule,
    MetricsModule,
    ActivityRecorderModule,
    ActivityModule,
    // No QueueProcessorModule here on purpose: the API only *produces* jobs
    // (via QueueProducerModule, imported where jobs are enqueued). Processors
    // run in the worker (src/worker.module.ts), so a request never competes
    // with an SMTP send for this process' event loop.
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
      validationOptions: { abortEarly: false },
    }),
    BullModule.forRoot({
      connection: redisConnection(),
      prefix: bullPrefix(),
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
    { provide: APP_GUARD, useClass: ChangeReasonGuard },
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
