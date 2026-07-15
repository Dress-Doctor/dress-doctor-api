import { Global, Module } from '@nestjs/common';
import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { attachHistoryHooks } from 'src/helper/mongoose-history.hook';
import { Setting, SettingSchema } from './settings.schema';
import { SettingHistory, SettingHistorySchema } from './setting-history.schema';

@Global()
@Module({
  imports: [
    MongooseModule.forFeatureAsync([
      {
        name: Setting.name,
        inject: [getModelToken(SettingHistory.name)],
        useFactory: (historyModel: Model<SettingHistory>) => {
          const schema = SettingSchema;
          return attachHistoryHooks({
            schema,
            historyModel,
            idField: 'settingId',
            resourceName: Setting.name,
          });
        },
      },
    ]),
    MongooseModule.forFeature([
      { name: SettingHistory.name, schema: SettingHistorySchema },
    ]),
  ],
  exports: [MongooseModule],
})
export class SettingsSchemaModule {}
