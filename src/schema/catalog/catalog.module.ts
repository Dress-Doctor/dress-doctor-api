import { Global, Module } from '@nestjs/common';
import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Category, CategorySchema } from './category.schema';
import { SubCategory, SubCategorySchema } from './sub-category.schema';
import { Currency, CurrencySchema } from './currency.schema';
import { Item, ItemSchema } from './item.schema';
import { Service, ServiceSchema } from './service.schema';
import { ServiceType, ServiceTypeSchema } from './service-type.schema';
import { ItemHistory, ItemHistorySchema } from './item-history.schema';
import { Model } from 'mongoose';
import { attachHistoryHooks } from 'src/helper/mongoose-history.hook';
import { ItemCategory, ItemCategorySchema } from './item-category.schema';
import {
  ItemSubCategory,
  ItemSubCategorySchema,
} from './item-sub-category.schema';

@Global()
@Module({
  imports: [
    MongooseModule.forFeatureAsync([
      {
        name: Item.name,
        inject: [getModelToken(ItemHistory.name)],
        useFactory: (historyModel: Model<ItemHistory>) => {
          const schema = ItemSchema;
          return attachHistoryHooks({
            schema,
            historyModel,
            idField: 'itemId',
            resourceName: Item.name,
          });
        },
      },
    ]),
    MongooseModule.forFeature([
      { name: Service.name, schema: ServiceSchema },
      { name: Category.name, schema: CategorySchema },
      { name: Currency.name, schema: CurrencySchema },
      { name: ItemHistory.name, schema: ItemHistorySchema },
      { name: SubCategory.name, schema: SubCategorySchema },
      { name: ServiceType.name, schema: ServiceTypeSchema },
      { name: ItemCategory.name, schema: ItemCategorySchema },
      { name: ItemSubCategory.name, schema: ItemSubCategorySchema },
    ]),
  ],
  exports: [MongooseModule],
})
export class CatalogSchemaModule {}
