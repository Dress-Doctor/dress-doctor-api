import { Logger } from '@nestjs/common';
import { Model, Types } from 'mongoose';
import { AuditContextDto } from '../mongoose-history.hook';

/**
 * How the seeder writes a row, and who owns what afterwards.
 *
 * The rule this file exists to enforce: **the seed creates a row, a person
 * owns it from then on.** A manager can rename a category, reword a status or
 * correct a price from the panel, and the next seed run must leave all of that
 * exactly as they left it.
 *
 * So the fields of a seeded row fall into two groups:
 *
 * - `onInsert` — everything a person may edit. Written once, when the row is
 *   first created, and never touched again.
 * - `owned` — the few fields the seed keeps in step for ever, because nothing
 *   in the panel can change them. Usually a link to another row, or nothing
 *   at all.
 *
 * And the row is found by something nobody can edit (`filter`), never by its
 * display name — otherwise renaming it in the panel would make the next run
 * think the row had gone and create it again.
 */
/**
 * A plain mongo filter. Kept as a loose record rather than mongoose's own
 * filter type, which has been renamed twice across major versions.
 */
export type SeedFilter = Record<string, unknown>;

export type SeedPlan = {
  /**
   * How the seeder recognises this row. Must be a field a person cannot
   * change: a `seedKey`, a slug, a locked name.
   */
  filter: SeedFilter;

  /**
   * Written when the row is created and never again. Everything a person may
   * edit lives here — names, descriptions, prices, active/inactive.
   */
  onInsert: Record<string, unknown>;

  /**
   * Kept in step on every run, because nothing in the panel can change it.
   * Leave it out when the answer is "nothing".
   */
  owned?: Record<string, unknown>;
};

/** What the seeder did to one row. */
export type SeedOutcome = 'created' | 'unchanged' | 'updated';

export type SeedResult<T> = {
  outcome: SeedOutcome;
  doc: T;
};

/** Running totals, so a seed run can say what it actually did. */
export class SeedTally {
  created = 0;
  updated = 0;
  unchanged = 0;

  add(outcome: SeedOutcome): void {
    this[outcome] += 1;
  }

  get total(): number {
    return this.created + this.updated + this.unchanged;
  }

  toString(): string {
    return `${this.total} rows — ${this.created} created, ${this.updated} updated, ${this.unchanged} left alone`;
  }
}

/** Same comparison the history hook uses, so the two never disagree. */
function same(a: unknown, b: unknown): boolean {
  if (a instanceof Types.ObjectId || b instanceof Types.ObjectId) {
    return String(a) === String(b);
  }
  if (a instanceof Date && b instanceof Date) return +a === +b;
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Create the row if it is missing, and otherwise leave it almost entirely
 * alone.
 *
 * The important part is what happens when nothing has changed: **no write at
 * all**. Not a no-op `$set`, not a touch of `updatedAt` — nothing reaches the
 * database. That is what stops a restart from making every reference row look
 * as though somebody edited it today.
 *
 * Writes go through `save()` and `findOneAndUpdate()` rather than
 * `bulkWrite()`, because those are the two the history hook listens for. A
 * `bulkWrite` is invisible to it: the row would change with nothing in the
 * trail to say so.
 */
export async function upsertSeedRow<T>(input: {
  model: Model<T>;
  plan: SeedPlan;
  audit?: AuditContextDto;
  logger?: Logger;
  /** Built only when the row turns out to be missing — see `reference`. */
  generate?: () => Promise<Record<string, unknown>>;
}): Promise<SeedResult<T>> {
  const { model, plan, audit, logger, generate } = input;

  const existing = await model.findOne(plan.filter as never).exec();

  if (!existing) {
    const generated = generate ? await generate() : {};
    const doc = new model({
      ...plan.onInsert,
      ...(plan.owned ?? {}),
      ...plan.filter,
      ...generated,
    });
    // The history hook reads a create's audit fields off `$locals`, since a
    // save() carries no query options.
    const locals = (doc as { $locals: Record<string, unknown> }).$locals;
    locals.changedBy = audit?.changedBy;
    locals.reason = audit?.reason;
    await doc.save();
    return { outcome: 'created', doc: doc as T };
  }

  // Only the seed-owned fields are even considered. Everything a person may
  // edit was written once, at creation, and is none of the seeder's business
  // now.
  const drift: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(plan.owned ?? {})) {
    const current = (existing as unknown as Record<string, unknown>)[key];
    if (!same(current, value)) {
      drift[key] = value;
    }
  }

  if (!Object.keys(drift).length) {
    return { outcome: 'unchanged', doc: existing };
  }

  const updated = (await model
    .findOneAndUpdate({ _id: existing._id } as SeedFilter, { $set: drift }, {
      context: audit,
      returnDocument: 'after',
    } as never)
    .exec()) as unknown as typeof existing;

  logger?.debug(
    `Seed repaired ${Object.keys(drift).join(', ')} on ${String(existing._id)}`,
  );

  return { outcome: 'updated', doc: (updated ?? existing) as T };
}
