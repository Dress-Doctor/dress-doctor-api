/**
 * One-shot backfill: fill in `displayName` and `unitPrice` on every item.
 *
 * Both were added after the items were seeded, so the rows already in the
 * database have neither. They are derived, so nothing a person does will fill
 * them in — an item is only rewritten when somebody edits it, and most never
 * are.
 *
 * Recomputes rather than repairs: it reads each item's links and prices and
 * writes what they say, so a re-run is a no-op on a row that is already
 * right. Safe to run at any time, and worth running after a bulk import that
 * bypassed the API.
 *
 * Run:  npm run backfill:item-derived
 */
import { Logger } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  itemDisplayName,
  itemUnitPrice,
} from './../helper/catalog/item-derived';
import { categorySchemaName } from './../schema/catalog/category.schema';
import { itemCategorySchemaName } from './../schema/catalog/item-category.schema';
import { itemSubCategorySchemaName } from './../schema/catalog/item-sub-category.schema';
import { Item } from './../schema/catalog/item.schema';
import { subCategorySchemaName } from './../schema/catalog/sub-category.schema';
import { createScriptContext } from './script-context';

/** How many items are rewritten per round trip. */
const BATCH = 500;

type Row = {
  _id: Types.ObjectId;
  itemName: string;
  priceLow: number;
  priceHigh: number;
  displayName?: string;
  unitPrice?: number;
  categoryNames: string[];
  subCategoryNames: string[];
};

async function backfill() {
  const logger = new Logger('BackfillItemDerived');
  const app = await createScriptContext();

  try {
    const itemModel = app.get<Model<Item>>(getModelToken(Item.name));

    const total = await itemModel.countDocuments();
    logger.log(`${total} item(s) to check`);

    const rows = await itemModel.aggregate<Row>([
      {
        $lookup: {
          localField: '_id',
          as: 'itemCategories',
          foreignField: 'itemId',
          from: itemCategorySchemaName,
        },
      },
      {
        $lookup: {
          as: 'categories',
          foreignField: '_id',
          from: categorySchemaName,
          localField: 'itemCategories.categoryId',
        },
      },
      {
        $lookup: {
          localField: '_id',
          foreignField: 'itemId',
          as: 'itemSubCategories',
          from: itemSubCategorySchemaName,
        },
      },
      {
        $lookup: {
          foreignField: '_id',
          as: 'subCategories',
          from: subCategorySchemaName,
          localField: 'itemSubCategories.subCategoryId',
        },
      },
      {
        $project: {
          itemName: 1,
          priceLow: 1,
          priceHigh: 1,
          displayName: 1,
          unitPrice: 1,
          categoryNames: '$categories.categoryName',
          subCategoryNames: '$subCategories.subCategoryName',
        },
      },
    ]);

    // Only the rows that would actually change are written, so a re-run over
    // a healthy catalogue touches nothing and says so.
    const writes = rows
      .map((row) => ({
        _id: row._id,
        unitPrice: itemUnitPrice(row.priceLow, row.priceHigh),
        displayName: itemDisplayName({
          itemName: row.itemName,
          categoryNames: row.categoryNames,
          subCategoryNames: row.subCategoryNames,
        }),
        was: { displayName: row.displayName, unitPrice: row.unitPrice },
      }))
      .filter(
        (row) =>
          row.displayName !== row.was.displayName ||
          row.unitPrice !== row.was.unitPrice,
      );

    logger.log(`${writes.length} item(s) need rewriting`);

    let done = 0;
    for (let i = 0; i < writes.length; i += BATCH) {
      const batch = writes.slice(i, i + BATCH);
      await itemModel.bulkWrite(
        batch.map(({ _id, displayName, unitPrice }) => ({
          updateOne: {
            filter: { _id },
            update: { $set: { displayName, unitPrice } },
            timestamps: false,
          },
        })),
        // No audit context and no timestamps: this fills in fields that should
        // always have been there, it is not a change anyone made to the item.
        { timestamps: false },
      );
      done += batch.length;
      logger.log(`… ${done}/${writes.length}`);
    }

    logger.log(`✅ Backfilled ${done} item(s)`);
  } finally {
    await app.close();
  }
}

backfill().catch((error) => {
  new Logger('BackfillItemDerived').error(error);
  process.exit(1);
});
