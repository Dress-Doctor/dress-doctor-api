import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JobRun, JobRunSchema } from './job-run.schema';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([{ name: JobRun.name, schema: JobRunSchema }]),
  ],
  exports: [MongooseModule],
})
export class JobRunSchemaModule {}
