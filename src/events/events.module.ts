import { Module } from '@nestjs/common';
import { QueueProducerModule } from 'src/queue/queue-producer.module';
import { AppUtilService } from 'src/helper/service/app-util.service';
import { NotificationService } from 'src/helper/service/notification.service';
import { WhatsAppProvider } from 'src/helper/service/whatsapp.provider';
import { TransactionalMessageListener } from './transactional-message.listener';

// Domain-event listeners (side effects off the lean write path). Lives in the
// API process — that's where the domain events are emitted.
@Module({
  imports: [QueueProducerModule],
  providers: [
    TransactionalMessageListener,
    NotificationService,
    WhatsAppProvider,
    AppUtilService,
  ],
})
export class EventsModule {}
