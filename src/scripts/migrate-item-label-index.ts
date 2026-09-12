/**
 * Moves the item catalogue's uniqueness from `itemName` to `displayName`.
 *
 *     npm run migrate:item-label
 *
 * Why it has to be a script rather than a schema change alone: an index that
 * exists in mongo is not removed by deleting `unique: true` from the model.
 * The old `itemName_1` index goes on rejecting a second `Hoodie` long after
 * the code stopped asking for it — and the price list genuinely charges the
 * same garment differently depending on who wears it and where it is filed, so
 * `Hoodie (Men - Tops)`, `Hoodie (Men - Bottoms)` and `Hoodie (Men - Full
 * Body)` are three rows with three prices.
 *
 * What it does, in order:
 *
 *   1. reports any two items that already read the same — the migration
 *      cannot make those unique, and guessing which one to drop is not a
 *      script's decision — and stops if it finds some, having changed nothing;
 *   2. drops `itemName_1`;
 *   3. replaces the plain `displayName_1` with a unique, sparse one.
 *
 * Safe to run as often as you like: each step checks what is there first, and
 * a database already in the target state is left untouched.
 */
import { Logger } from '@nestjs/common';
import { connect, connection } from 'mongoose';
import { itemSchemaName } from '../schema/catalog/item.schema';

const OLD_INDEX = 'itemName_1';
const NEW_INDEX = 'displayName_1';

type DuplicateLabel = { _id: string | null; count: number };

export async function migrateItemLabelIndex(logger: Logger): Promise<void> {
  const items = connection.collection(itemSchemaName);

  const duplicates = await items
    .aggregate<DuplicateLabel>([
      { $match: { displayName: { $nin: [null, ''] } } },
      { $group: { _id: '$displayName', count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $sort: { count: -1 } },
    ])
    .toArray();

  if (duplicates.length) {
    const listed = duplicates
      .map((row) => `${row._id ?? '(no label)'} ×${row.count}`)
      .join(', ');

    throw new Error(
      `${duplicates.length} label(s) are already used by more than one item, so a unique index cannot be built: ${listed}. ` +
        'Merge or retire the extra rows first — which of them to keep is a decision about the price list, not one this script can make.',
    );
  }

  const existing = await items.indexes();
  const byName = new Map(existing.map((index) => [index.name, index]));

  if (byName.has(OLD_INDEX)) {
    await items.dropIndex(OLD_INDEX);
    logger.log(`Dropped ${OLD_INDEX} — an item name may now repeat.`);
  } else {
    logger.log(`${OLD_INDEX} is already gone.`);
  }

  const current = byName.get(NEW_INDEX);

  // The plain index and the unique one share a name, so the old one has to go
  // before the new one can be built.
  if (current && !current.unique) {
    await items.dropIndex(NEW_INDEX);
    logger.log(`Dropped the non-unique ${NEW_INDEX}.`);
  }

  if (!current?.unique) {
    await items.createIndex(
      { displayName: 1 },
      { unique: true, sparse: true, name: NEW_INDEX },
    );
    logger.log(`Built ${NEW_INDEX} as unique — a label may not repeat.`);
  } else {
    logger.log(`${NEW_INDEX} is already unique.`);
  }
}

async function main() {
  const logger = new Logger('MigrateItemLabelIndex');
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error('DATABASE_URL is not set.');
  }

  await connect(url);

  try {
    await migrateItemLabelIndex(logger);
  } finally {
    await connection.close();
  }

  logger.log('Done.');
}

// Only when run directly: importing this file for a test must not connect to
// anything.
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Item label index migration failed:', error);
      process.exit(1);
    });
}
