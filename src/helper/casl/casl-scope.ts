import { MongoAbility } from '@casl/ability';
import { rulesToQuery } from '@casl/ability/extra';
import { Types } from 'mongoose';
import {
  AppAbilityDto,
  CaslActionsDto,
  CaslSubjectsDto,
  ConditionsDto,
} from './casl.dto';

const OBJECT_ID_HEX = /^[a-f0-9]{24}$/i;

/**
 * Condition ids arrive as strings (JSON-interpolated `$self`/`$office`), but
 * Mongoose does NOT cast strings to ObjectId inside `$or`, and aggregate
 * `$match` never casts at all — so a string officeId/customerId would match
 * nothing and lock scoped users out. Deep-cast 24-hex id strings to ObjectId so
 * the filter matches real ObjectId fields in both find() and aggregate().
 */
function castIds(value: unknown): unknown {
  if (typeof value === 'string') {
    return OBJECT_ID_HEX.test(value) ? new Types.ObjectId(value) : value;
  }
  if (Array.isArray(value)) return value.map(castIds);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) out[key] = castIds(val);
    return out;
  }
  return value;
}

/**
 * Derive a Mongo filter from the caller's CASL rules for (action, subject), to
 * merge into a query so results are auto-scoped to what the caller may access —
 * office-scoped for staff, self-scoped for customers/affiliates. Enforcement is
 * by query (not instance checks), so a get-by-id for a record outside the
 * caller's scope simply returns nothing.
 *
 * - Fully denied (no matching rule) → an impossible filter (`{ _id: { $in: [] } }`)
 *   so the query returns nothing.
 * - Fully allowed (a rule with no conditions, e.g. GLOBAL `manage`) → `{}`.
 * - Conditionally allowed → the rules' conditions (e.g. `{ $or: [...] }`).
 */
export function scopeFilter(
  ability: MongoAbility<AppAbilityDto, ConditionsDto>,
  action: CaslActionsDto,
  subject: CaslSubjectsDto,
): Record<string, unknown> {
  if (!ability.can(action, subject)) {
    return { _id: { $in: [] } };
  }

  const query = rulesToQuery(ability, action, subject, (rule) =>
    rule.inverted ? { $nor: [rule.conditions] } : rule.conditions,
  );

  // null → at least one matching rule has no conditions → unrestricted.
  return castIds(query ?? {}) as Record<string, unknown>;
}
