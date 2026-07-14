import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import type { SignOptions } from 'jsonwebtoken';
import { CodeGeneratorService } from 'src/helper/service/code-generator.service';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { CaslAbilityService } from 'src/helper/casl/casl-ability.service';
import { OtpService } from 'src/helper/service/otp.service';
import { NotificationService } from 'src/helper/service/notification.service';
import { WhatsAppProvider } from 'src/helper/service/whatsapp.provider';
import { AppUtilService } from 'src/helper/service/app-util.service';
import { QueueProducerModule } from 'src/queue/queue-producer.module';

@Module({
  imports: [
    QueueProducerModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        global: true,
        // Short-lived by design; the rotated refresh token carries longevity.
        signOptions: {
          expiresIn: config.get<string>(
            'JWT_ACCESS_TTL',
            '15m',
          ) as SignOptions['expiresIn'],
        },
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    OtpService,
    AuthService,
    AppUtilService,
    CaslAbilityService,
    NotificationService,
    WhatsAppProvider,
    CodeGeneratorService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [AuthService],
})
export class AuthModule {}
