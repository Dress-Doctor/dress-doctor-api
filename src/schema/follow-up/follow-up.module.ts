import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FollowUp, FollowUpSchema } from './follow-up.schema';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: FollowUp.name, schema: FollowUpSchema },
    ]),
  ],
  exports: [MongooseModule],
})
export class FollowUpSchemaModule {}
