import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

@Global()
@Module({
  imports: [
    MongooseModule.forRootAsync({
      useFactory: () => ({ uri: process.env.DATABASE_URL }),
    }),
  ],
  exports: [MongooseModule],
})
export class SchemaModule {}
