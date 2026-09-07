/**
 * The two fields on an item nobody types: its display name and its unit price.
 *
 * Both are derived, so both are written by the code rather than by a person —
 * `CreateItemDto` and `UpdateItemDto` do not carry either. They are stored
 * rather than computed on read so a search can reach them and an index can
 * order by them, and the price of storing a derived value is that every write
 * which can change an input has to recompute it. `recomputeItemDerived` in
 * `catalogue.service` is the one place that does, and every such write goes
 * through it: adding an item, editing one, and renaming a category or a sub
 * category, which changes the display name of every item filed under it.
 *
 * Pure functions with no database of their own, so the seeder, the API and the
 * backfill script all agree on the answer by construction.
 */

/**
 * The midpoint of an item's price range.
 *
 * Rounded to a whole unit: every price the API accepts is an integer, XAF has
 * no minor unit, and "650.5 FCFA" is not a figure anyone can charge. Halves
 * round up, which is the behaviour of `Math.round` and the one a price list
 * wants — rounding a price down is a discount nobody agreed to.
 *
 * Not to be confused with `OrderItem.unitPrice`, which is what was actually
 * charged on one order line. This is the list price the counter starts from.
 */
export function itemUnitPrice(priceLow: number, priceHigh: number): number {
  const low = Number(priceLow);
  const high = Number(priceHigh);

  // A missing or unreadable side makes the average a lie rather than a
  // smaller number, so fall back to whichever side is real.
  if (!Number.isFinite(low) && !Number.isFinite(high)) return 0;
  if (!Number.isFinite(low)) return Math.round(high);
  if (!Number.isFinite(high)) return Math.round(low);

  return Math.round((low + high) / 2);
}

/**
 * The label an item is read by: its name, qualified by what it is filed under.
 *
 *   Jeans (Men - Bottoms)
 *
 * An item may carry several categories and several sub categories, so each
 * side is joined with a comma and the two sides are separated by a dash:
 *
 *   Jeans (Men, Women - Bottoms)
 *
 * Either side may be empty, and both may be. The bracket only appears when
 * there is something to put in it, so an unfiled item reads as plain `Jeans`
 * rather than as `Jeans ( - )`:
 *
 *   Jeans (Men)        — categories only
 *   Jeans (Bottoms)    — sub categories only
 *   Jeans              — neither
 *
 * Names arrive in whatever order the link table returned them, which is not
 * meaningful, so they are sorted: two items filed the same way must read the
 * same way, or the column looks wrong to anyone scanning it.
 */
export function itemDisplayName(input: {
  itemName: string;
  categoryNames?: (string | undefined)[];
  subCategoryNames?: (string | undefined)[];
}): string {
  const name = (input.itemName ?? '').trim();

  const side = (names?: (string | undefined)[]) =>
    [...new Set((names ?? []).map((value) => value?.trim()).filter(Boolean))]
      .sort((a, b) => (a as string).localeCompare(b as string))
      .join(', ');

  const categories = side(input.categoryNames);
  const subCategories = side(input.subCategoryNames);

  const qualifier = [categories, subCategories].filter(Boolean).join(' - ');

  return qualifier ? `${name} (${qualifier})` : name;
}
