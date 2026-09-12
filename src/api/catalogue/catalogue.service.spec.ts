import { ConflictException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { AppUtilService } from 'src/helper/service/app-util.service';
import { CodeGeneratorService } from 'src/helper/service/code-generator.service';
import { HistoryLabelService } from 'src/helper/service/history-label.service';
import { Category } from 'src/schema/catalog/category.schema';
import { Currency } from 'src/schema/catalog/currency.schema';
import { ItemCategory } from 'src/schema/catalog/item-category.schema';
import { ItemSubCategory } from 'src/schema/catalog/item-sub-category.schema';
import { Item } from 'src/schema/catalog/item.schema';
import { ItemHistory } from 'src/schema/catalog/item-history.schema';
import { Service } from 'src/schema/catalog/service.schema';
import { ServiceType } from 'src/schema/catalog/service-type.schema';
import { SubCategory } from 'src/schema/catalog/sub-category.schema';
import { CatalogueService } from './catalogue.service';
import { CreateItemDto } from './dto/create-item.dto';

/**
 * What an item may not share with another item.
 *
 * The price list charges the same garment differently depending on who wears
 * it — a `Hoodie` is one row under Men/Tops, another under Men/Bottoms, a
 * third under Men/Full Body — so the name on its own cannot be unique. The
 * label is: the name together with the filing, which is what `displayName`
 * holds and what an operator reads in the list.
 */
type DocFactory = (data: Record<string, unknown>) => Record<string, unknown>;

const modelMock = (factory?: DocFactory) => {
  const ctor = jest
    .fn()
    .mockImplementation(factory ?? (() => ({}))) as jest.Mock & {
    aggregate: jest.Mock;
    create: jest.Mock;
    exists: jest.Mock;
    find: jest.Mock;
    findById: jest.Mock;
    findOne: jest.Mock;
    findOneAndUpdate: jest.Mock;
    insertMany: jest.Mock;
    deleteMany: jest.Mock;
    bulkWrite: jest.Mock;
  };
  ctor.aggregate = jest.fn().mockReturnValue({ toArray: () => [] });
  ctor.create = jest.fn().mockResolvedValue(undefined);
  ctor.exists = jest.fn().mockResolvedValue(null);
  ctor.find = jest.fn();
  ctor.findById = jest.fn().mockResolvedValue(null);
  ctor.findOne = jest.fn().mockResolvedValue(null);
  ctor.findOneAndUpdate = jest.fn().mockResolvedValue(null);
  ctor.insertMany = jest.fn().mockResolvedValue([]);
  ctor.deleteMany = jest.fn().mockResolvedValue(undefined);
  ctor.bulkWrite = jest.fn().mockResolvedValue(undefined);
  return ctor;
};

/** A `find().select().lean()` chain resolving to whatever is handed in. */
const leanRows = (rows: unknown[]) => ({
  select: () => ({ lean: () => Promise.resolve(rows) }),
});

/** A `findOne().select().lean()` chain, for the reference lookups. */
const leanRow = (row: unknown) => ({
  select: () => ({ lean: () => Promise.resolve(row) }),
});

describe('CatalogueService — item labels', () => {
  let service: CatalogueService;
  let itemModel: ReturnType<typeof modelMock>;
  let categoryModel: ReturnType<typeof modelMock>;
  let subCategoryModel: ReturnType<typeof modelMock>;
  let itemCategoryModel: ReturnType<typeof modelMock>;
  let itemSubCategoryModel: ReturnType<typeof modelMock>;

  const userId = new Types.ObjectId().toString();
  const menId = new Types.ObjectId();
  const bottomsId = new Types.ObjectId();
  const itemId = new Types.ObjectId();

  const payload: CreateItemDto = {
    itemName: 'Hoodie',
    priceLow: 500,
    priceHigh: 900,
    serviceReference: 'SV-A4F92C',
    serviceTypeReference: 'ST-A4F92C',
    currencyReference: 'CY-A4F92C',
    categoryReferences: ['CT-MEN'],
    subCategoryReferences: ['SC-BOTTOMS'],
  };

  /** The label `exists` was asked about, as a plain string. */
  const askedLabel = (): string => {
    const [where] = itemModel.exists.mock.calls[0] as [{ displayName: string }];
    return where.displayName;
  };

  beforeEach(async () => {
    itemModel = modelMock((data) => ({
      ...data,
      _id: itemId,
      $locals: {} as Record<string, unknown>,
      save: jest.fn().mockResolvedValue(undefined),
    }));
    categoryModel = modelMock();
    subCategoryModel = modelMock();
    itemCategoryModel = modelMock();
    itemSubCategoryModel = modelMock();

    const serviceModel = modelMock();
    const currencyModel = modelMock();
    const serviceTypeModel = modelMock();
    const itemHistoryModel = modelMock();

    // The three straight reference lookups an item body carries.
    serviceModel.findOne.mockReturnValue(
      leanRow({ _id: new Types.ObjectId() }),
    );
    serviceTypeModel.findOne.mockReturnValue(
      leanRow({ _id: new Types.ObjectId() }),
    );
    currencyModel.findOne.mockReturnValue(
      leanRow({ _id: new Types.ObjectId() }),
    );

    // Categories and sub categories are read twice: once to turn references
    // into ids, once to turn those ids into the names the label is built from.
    categoryModel.find.mockImplementation((filter: Record<string, unknown>) =>
      leanRows(
        '_id' in filter
          ? [{ _id: menId, categoryName: 'Men' }]
          : [{ _id: menId, reference: 'CT-MEN' }],
      ),
    );
    subCategoryModel.find.mockImplementation(
      (filter: Record<string, unknown>) =>
        leanRows(
          '_id' in filter
            ? [{ _id: bottomsId, subCategoryName: 'Bottoms' }]
            : [{ _id: bottomsId, reference: 'SC-BOTTOMS' }],
        ),
    );

    // Nothing is filed under the item yet, and the recompute has nothing to do
    // in a unit test — both are the paths after the check this file is about.
    itemCategoryModel.find.mockReturnValue(leanRows([]));
    itemSubCategoryModel.find.mockReturnValue(leanRows([]));
    itemModel.aggregate.mockResolvedValue([]);
    itemModel.findById.mockResolvedValue({ _id: itemId });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatalogueService,
        { provide: AppUtilService, useValue: { parseSortParam: () => ({}) } },
        {
          provide: CodeGeneratorService,
          useValue: {
            generateItemReference: jest.fn().mockResolvedValue('IT-A4F92C'),
          },
        },
        {
          provide: HistoryLabelService,
          useValue: { labelChanges: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: REQUEST,
          useValue: {
            headers: { 'x-change-reason': 'adding the autumn range' },
            data: { platform: 'WEB' },
            user: { phone: '600', userId, ability: { can: () => true } },
          },
        },
        { provide: getModelToken(Item.name), useValue: itemModel },
        { provide: getModelToken(Service.name), useValue: serviceModel },
        { provide: getModelToken(Currency.name), useValue: currencyModel },
        { provide: getModelToken(Category.name), useValue: categoryModel },
        {
          provide: getModelToken(ServiceType.name),
          useValue: serviceTypeModel,
        },
        {
          provide: getModelToken(SubCategory.name),
          useValue: subCategoryModel,
        },
        {
          provide: getModelToken(ItemCategory.name),
          useValue: itemCategoryModel,
        },
        {
          provide: getModelToken(ItemSubCategory.name),
          useValue: itemSubCategoryModel,
        },
        {
          provide: getModelToken(ItemHistory.name),
          useValue: itemHistoryModel,
        },
      ],
    }).compile();

    service = await module.resolve(CatalogueService);
  });

  it('checks the name together with the filing, not the name alone', async () => {
    await service.createItem(payload);

    expect(askedLabel()).toBe('Hoodie (Men - Bottoms)');
    // A `Hoodie` filed elsewhere is a different price and a different row, so
    // the name on its own is never what is looked up.
    expect(itemModel.exists).not.toHaveBeenCalledWith(
      expect.objectContaining({ itemName: 'Hoodie' }),
    );
  });

  it('refuses a second item reading the same as one that exists', async () => {
    itemModel.exists.mockResolvedValue({ _id: new Types.ObjectId() });

    await expect(service.createItem(payload)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('refuses a re-filing that would collide, before writing anything', async () => {
    const existing = {
      _id: itemId,
      itemName: 'Hoodie',
      priceLow: 500,
      priceHigh: 900,
      reference: 'IT-A4F92C',
    };
    itemModel.findOne.mockResolvedValue(existing);
    // Filed under Men today, and the body moves only the sub category — so the
    // category side of the label has to come from the row as it stands.
    itemCategoryModel.find.mockReturnValue(leanRows([{ categoryId: menId }]));
    // The row it would collide with: a `Hoodie` already filed under Bottoms.
    itemModel.exists.mockResolvedValue({ _id: new Types.ObjectId() });

    await expect(
      service.updateItem('IT-A4F92C', {
        subCategoryReferences: ['SC-BOTTOMS'],
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    // The name never changed, so only the new filing can have raised this —
    // and it has to be raised before the first write, or half the move lands.
    expect(askedLabel()).toBe('Hoodie (Men - Bottoms)');
    expect(itemModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(itemSubCategoryModel.deleteMany).not.toHaveBeenCalled();
  });

  it('lets an item keep its own label when something else is edited', async () => {
    const existing = {
      _id: itemId,
      itemName: 'Hoodie',
      priceLow: 500,
      priceHigh: 900,
      reference: 'IT-A4F92C',
    };
    itemModel.findOne.mockResolvedValue(existing);
    itemCategoryModel.find.mockReturnValue(leanRows([{ categoryId: menId }]));

    await service.updateItem('IT-A4F92C', {
      itemName: 'Hooded Top',
      subCategoryReferences: ['SC-BOTTOMS'],
    });

    // Itself excluded from the check: an item is not its own duplicate.
    expect(itemModel.exists).toHaveBeenCalledWith(
      expect.objectContaining({ _id: { $ne: itemId } }),
    );
    expect(itemModel.findOneAndUpdate).toHaveBeenCalled();
  });
});
