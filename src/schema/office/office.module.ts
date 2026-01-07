import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OfficeType, OfficeTypeSchema } from './office-type.schema';
import { OfficeUser, OfficeUserSchema } from './office-user.schema';
import {
  OfficeUserHistory,
  OfficeUserHistorySchema,
} from './office-user-history.schema';
import { Office, OfficeSchema } from './office.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Office.name, schema: OfficeSchema },
      { name: OfficeType.name, schema: OfficeTypeSchema },
      { name: OfficeUser.name, schema: OfficeUserSchema },
      { name: OfficeUserHistory.name, schema: OfficeUserHistorySchema },
    ]),
  ],
  exports: [MongooseModule],
})
export class OfficeSchemaModule {}
