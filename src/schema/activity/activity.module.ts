import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Activity, ActivitySchema } from './activity.schema';

const models = MongooseModule.forFeature([
  { name: Activity.name, schema: ActivitySchema },
]);

@Global()
@Module({ imports: [models], exports: [models] })
export class ActivitySchemaModule {}
