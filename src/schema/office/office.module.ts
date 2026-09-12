import { Global, Module } from '@nestjs/common';
import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { attachHistoryHooks } from 'src/helper/mongoose-history.hook';
import { OfficeHistory, OfficeHistorySchema } from './office-history.schema';
import {
  OfficeTypeHistory,
  OfficeTypeHistorySchema,
} from './office-type-history.schema';
import { OfficeType, OfficeTypeSchema } from './office-type.schema';
import { OfficeUser, OfficeUserSchema } from './office-user.schema';
import {
  OfficeUserHistory,
  OfficeUserHistorySchema,
} from './office-user-history.schema';
import { Office, OfficeSchema } from './office.schema';

@Global()
@Module({
  imports: [
    // Both writable office collections record their own trail. The office
    // detail page merges them, so a reader sees "address corrected" and
    // "Sandra Efon removed from Front Desk" in one list.
    MongooseModule.forFeatureAsync([
      {
        name: Office.name,
        inject: [getModelToken(OfficeHistory.name)],
        useFactory: (historyModel: Model<OfficeHistory>) =>
          attachHistoryHooks({
            historyModel,
            idField: 'officeId',
            schema: OfficeSchema,
            resourceName: Office.name,
          }),
      },
      {
        name: OfficeUser.name,
        inject: [getModelToken(OfficeUserHistory.name)],
        useFactory: (historyModel: Model<OfficeUserHistory>) =>
          attachHistoryHooks({
            historyModel,
            idField: 'officeUserId',
            schema: OfficeUserSchema,
            resourceName: OfficeUser.name,
          }),
      },

      // Reference data, but editable from the reference screen now — name
      // included — so its edits are recorded like any other domain write.
      {
        name: OfficeType.name,
        inject: [getModelToken(OfficeTypeHistory.name)],
        useFactory: (historyModel: Model<OfficeTypeHistory>) =>
          attachHistoryHooks({
            historyModel,
            idField: 'officeTypeId',
            schema: OfficeTypeSchema,
            resourceName: OfficeType.name,
          }),
      },
    ]),
    MongooseModule.forFeature([
      { name: OfficeHistory.name, schema: OfficeHistorySchema },
      { name: OfficeUserHistory.name, schema: OfficeUserHistorySchema },
      { name: OfficeTypeHistory.name, schema: OfficeTypeHistorySchema },
    ]),
  ],
  exports: [MongooseModule],
})
export class OfficeSchemaModule {}
