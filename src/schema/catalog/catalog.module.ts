import { Global, Module } from '@nestjs/common';
import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { attachHistoryHooks } from 'src/helper/mongoose-history.hook';
import {
  CategoryHistory,
  CategoryHistorySchema,
} from './category-history.schema';
import { Category, CategorySchema } from './category.schema';
import {
  CurrencyHistory,
  CurrencyHistorySchema,
} from './currency-history.schema';
import { Currency, CurrencySchema } from './currency.schema';
import { ItemCategory, ItemCategorySchema } from './item-category.schema';
import { ItemHistory, ItemHistorySchema } from './item-history.schema';
import {
  ItemSubCategory,
  ItemSubCategorySchema,
} from './item-sub-category.schema';
import { Item, ItemSchema } from './item.schema';
import { Price, PriceSchema } from './price.schema';
import {
  ServiceTypeHistory,
  ServiceTypeHistorySchema,
} from './service-type-history.schema';
import { ServiceType, ServiceTypeSchema } from './service-type.schema';
import { ServiceHistory, ServiceHistorySchema } from './service-history.schema';
import { Service, ServiceSchema } from './service.schema';
import {
  SubCategoryHistory,
  SubCategoryHistorySchema,
} from './sub-category-history.schema';
import { SubCategory, SubCategorySchema } from './sub-category.schema';

@Global()
@Module({
  imports: [
    /*
     * Every catalogue row is audited. They are what the business sells and
     * what it charges, and the catalogue screen writes to all six from the
     * browser, so each one needs a trail saying what moved, by whom and why.
     *
     * `forFeatureAsync` rather than `forFeature`: the hook needs the history
     * model, which only exists once Mongoose has registered it, so the schema
     * is built in a factory that can inject it.
     */
    MongooseModule.forFeatureAsync([
      {
        name: Item.name,
        inject: [getModelToken(ItemHistory.name)],
        useFactory: (historyModel: Model<ItemHistory>) =>
          attachHistoryHooks({
            historyModel,
            idField: 'itemId',
            schema: ItemSchema,
            resourceName: Item.name,
          }),
      },
      {
        name: Service.name,
        inject: [getModelToken(ServiceHistory.name)],
        useFactory: (historyModel: Model<ServiceHistory>) =>
          attachHistoryHooks({
            historyModel,
            idField: 'serviceId',
            schema: ServiceSchema,
            resourceName: Service.name,
          }),
      },
      {
        name: ServiceType.name,
        inject: [getModelToken(ServiceTypeHistory.name)],
        useFactory: (historyModel: Model<ServiceTypeHistory>) =>
          attachHistoryHooks({
            historyModel,
            idField: 'serviceTypeId',
            schema: ServiceTypeSchema,
            resourceName: ServiceType.name,
          }),
      },
      {
        name: Category.name,
        inject: [getModelToken(CategoryHistory.name)],
        useFactory: (historyModel: Model<CategoryHistory>) =>
          attachHistoryHooks({
            historyModel,
            idField: 'categoryId',
            schema: CategorySchema,
            resourceName: Category.name,
          }),
      },
      {
        name: SubCategory.name,
        inject: [getModelToken(SubCategoryHistory.name)],
        useFactory: (historyModel: Model<SubCategoryHistory>) =>
          attachHistoryHooks({
            historyModel,
            idField: 'subCategoryId',
            schema: SubCategorySchema,
            resourceName: SubCategory.name,
          }),
      },
      {
        name: Currency.name,
        inject: [getModelToken(CurrencyHistory.name)],
        useFactory: (historyModel: Model<CurrencyHistory>) =>
          attachHistoryHooks({
            historyModel,
            idField: 'currencyId',
            schema: CurrencySchema,
            resourceName: Currency.name,
          }),
      },
    ]),

    MongooseModule.forFeature([
      { name: Price.name, schema: PriceSchema },
      { name: ItemHistory.name, schema: ItemHistorySchema },
      { name: ItemCategory.name, schema: ItemCategorySchema },
      { name: ItemSubCategory.name, schema: ItemSubCategorySchema },
      { name: ServiceHistory.name, schema: ServiceHistorySchema },
      { name: CategoryHistory.name, schema: CategoryHistorySchema },
      { name: CurrencyHistory.name, schema: CurrencyHistorySchema },
      { name: ServiceTypeHistory.name, schema: ServiceTypeHistorySchema },
      { name: SubCategoryHistory.name, schema: SubCategoryHistorySchema },
    ]),
  ],
  exports: [MongooseModule],
})
export class CatalogSchemaModule {}
