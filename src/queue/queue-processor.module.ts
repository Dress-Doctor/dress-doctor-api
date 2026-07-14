import { Module } from '@nestjs/common';
import { QueueProducerModule } from './queue-producer.module';
import { NotificationProcessor } from './processor/notification.processor';
import { AppUtilService } from 'src/helper/service/app-util.service';
import { NotificationService } from 'src/helper/service/notification.service';
import { WhatsAppProvider } from 'src/helper/service/whatsapp.provider';

@Module({
  imports: [QueueProducerModule],
  providers: [
    NotificationProcessor,
    AppUtilService,
    NotificationService,
    WhatsAppProvider,
  ],
})
export class QueueProcessorModule {}
