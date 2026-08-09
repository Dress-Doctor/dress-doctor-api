import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Model, Schema, SchemaType, Types } from 'mongoose';

/** One field an audit entry saw change, before labels are attached. */
export type HistoryChange = {
  field: string;
  from: unknown;
  to: unknown;
  fromLabel?: string;
  toLabel?: string;
};

/** Anything shaped like an audit entry — the trail of any history table. */
export type HistoryEntryLike = { changes: HistoryChange[] };

/**
 * Field name → the model it references, per source schema. Derived once from
 * Mongoose's own metadata and cached for the life of the process; a schema
 * cannot change under us at runtime.
 */
type RefMap = Map<string, string>;

/**
 * Reads `ref` off a schema path — including an array-of-ObjectId path, where
 * the ref lives on the caster rather than the path itself.
 */
function refOf(schemaType: SchemaType | null | undefined): string | undefined {
  if (!schemaType) return undefined;

  const options = schemaType.options as { ref?: unknown } | undefined;
  if (typeof options?.ref === 'string') return options.ref;

  const { caster } = schemaType as {
    caster?: { options?: { ref?: unknown } };
  };
  return typeof caster?.options?.ref === 'string'
    ? caster.options.ref
    : undefined;
}

/** A value that could address a document: an ObjectId, or its hex string. */
function asObjectId(value: unknown): Types.ObjectId | undefined {
  if (value instanceof Types.ObjectId) return value;
  if (typeof value === 'string' && /^[a-f\d]{24}$/i.test(value)) {
    return new Types.ObjectId(value);
  }
  return undefined;
}

/**
 * Turns the foreign keys inside an audit trail into something a human can
 * read — `orderStatusId: 6a58…53d → 6a58…53e` becomes `CONFIRMED → RECEIVED`.
 *
 * It is deliberately generic: nothing here knows about orders, payments or
 * any other domain. Which collection a field points at comes from the schema
 * itself (`Order.path('orderStatusId').options.ref`), and the field to show
 * is inferred from the target schema — so every one of the history tables is
 * covered by this one service, and a new `*Id` on a new schema is labelled
 * the day it is added, with no registry to update and no per-table query to
 * write.
 *
 * Resolution happens on read, not at write time, which means it also labels
 * the history rows already in the database and keeps the mutation path (the
 * money path included) free of extra lookups. The trade-off is that a label
 * shows the target's CURRENT name; the raw ids stay on every change, and the
 * stored snapshot still holds the values exactly as they were.
 */
@Injectable()
export class HistoryLabelService {
  private readonly logger = new Logger(HistoryLabelService.name);

  // Per-source-schema field → referenced model, and per-model label paths.
  private readonly refMaps = new Map<string, RefMap>();
  private readonly labelPaths = new Map<string, string[]>();

  constructor(@InjectConnection() private readonly connection: Connection) {}

  /**
   * Attach `fromLabel`/`toLabel` to every change that references another
   * document. `sourceModel` is the model the history belongs to (`Order.name`
   * for order history), because that is the schema carrying the refs.
   *
   * Batched: one query per referenced collection, however many entries the
   * trail holds. Raw `from`/`to` are never altered — a label is added beside
   * them, never in place of them, so a client that wants the id still has it.
   *
   * Best-effort by design: an unresolvable id (deleted row, a field with no
   * `ref`) simply comes back without a label rather than failing the read.
   */
  async labelChanges<T extends HistoryEntryLike>(
    sourceModel: string,
    entries: T[],
  ): Promise<T[]> {
    if (!entries.length) return entries;

    const refs = this.refMapFor(sourceModel);
    if (!refs.size) return entries;

    // Collect every id to resolve, grouped by the collection it lives in, so
    // a hundred status changes cost one query rather than a hundred.
    const wanted = new Map<string, Set<string>>();
    for (const entry of entries) {
      for (const change of entry.changes ?? []) {
        const ref = refs.get(change.field);
        if (!ref) continue;
        for (const value of [change.from, change.to]) {
          const id = asObjectId(value);
          if (!id) continue;
          const ids = wanted.get(ref) ?? new Set<string>();
          ids.add(id.toString());
          wanted.set(ref, ids);
        }
      }
    }
    if (!wanted.size) return entries;

    const labels = await this.loadLabels(wanted);

    for (const entry of entries) {
      for (const change of entry.changes ?? []) {
        const ref = refs.get(change.field);
        if (!ref) continue;
        const from = asObjectId(change.from);
        const to = asObjectId(change.to);
        const fromLabel = from && labels.get(`${ref}:${from.toString()}`);
        const toLabel = to && labels.get(`${ref}:${to.toString()}`);
        if (fromLabel) change.fromLabel = fromLabel;
        if (toLabel) change.toLabel = toLabel;
      }
    }

    return entries;
  }

  /** One query per referenced collection → `${model}:${id}` → label. */
  private async loadLabels(
    wanted: Map<string, Set<string>>,
  ): Promise<Map<string, string>> {
    const labels = new Map<string, string>();

    await Promise.all(
      [...wanted].map(async ([modelName, ids]) => {
        const model = this.modelFor(modelName);
        if (!model) return;

        const paths = this.labelPathsFor(modelName);
        if (!paths.length) return;

        try {
          const rows = await model
            .find({
              _id: { $in: [...ids].map((id) => new Types.ObjectId(id)) },
            })
            .select(paths.join(' '))
            .lean<Record<string, unknown>[]>();

          for (const row of rows) {
            const label = paths
              .map((path) => row[path])
              .filter((value): value is string => typeof value === 'string')
              .join(' ')
              .trim();
            const id = asObjectId(row._id);
            if (label && id) {
              labels.set(`${modelName}:${id.toString()}`, label);
            }
          }
        } catch (error) {
          // A label is a nicety; never let one cost the caller their history.
          this.logger.warn(
            `Could not label ${modelName} references: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }),
    );

    return labels;
  }

  private modelFor(name: string): Model<Record<string, unknown>> | undefined {
    return this.connection.models[name] as
      | Model<Record<string, unknown>>
      | undefined;
  }

  /** A model's paths, typed — `Schema.paths` comes through as `any`. */
  private pathsOf(
    model: Model<Record<string, unknown>>,
  ): Record<string, SchemaType> {
    const schema = model.schema as Schema<Record<string, unknown>>;
    return schema.paths as Record<string, SchemaType>;
  }

  /** field → referenced model, for every ref path on the source schema. */
  private refMapFor(sourceModel: string): RefMap {
    const cached = this.refMaps.get(sourceModel);
    if (cached) return cached;

    const refs: RefMap = new Map();
    const model = this.modelFor(sourceModel);
    if (model) {
      for (const [path, schemaType] of Object.entries(this.pathsOf(model))) {
        const ref = refOf(schemaType);
        if (ref) refs.set(path, ref);
      }
    } else {
      this.logger.warn(`No registered model named ${sourceModel}`);
    }

    this.refMaps.set(sourceModel, refs);
    return refs;
  }

  /**
   * Which field(s) name a document of this model, inferred from its schema:
   * a person is their first and last name; everything else in this codebase
   * carries a `<thing>Name` (orderStatusName, officeName, paymentMethodName…)
   * and falls back to whatever human-readable code it has.
   */
  private labelPathsFor(modelName: string): string[] {
    const cached = this.labelPaths.get(modelName);
    if (cached) return cached;

    const model = this.modelFor(modelName);
    const paths = model ? Object.keys(this.pathsOf(model)) : [];
    const has = (path: string) => paths.includes(path);

    let chosen: string[] = [];
    if (has('firstName') || has('lastName')) {
      chosen = ['firstName', 'lastName'].filter(has);
    } else {
      const named = paths.find(
        (path) => path.endsWith('Name') && !path.includes('.'),
      );
      const coded = ['code', 'reference', 'slug', 'title', 'isoCode'].find(has);
      const fallback = paths.find(
        (path) => path.endsWith('Code') && !path.includes('.'),
      );
      chosen = [named ?? coded ?? fallback].filter(
        (path): path is string => !!path,
      );
    }

    this.labelPaths.set(modelName, chosen);
    return chosen;
  }
}
