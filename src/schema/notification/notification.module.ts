import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  NotificationTemplate,
  NotificationTemplateSchema,
} from './notification-template.schema';
import { Notification, NotificationSchema } from './notification.schema';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
      { name: NotificationTemplate.name, schema: NotificationTemplateSchema },
    ]),
  ],
  exports: [MongooseModule],
})
export class NotificationSchemaModule {}
