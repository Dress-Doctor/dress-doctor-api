import { MongoAbility } from '@casl/ability';
import { rulesToQuery } from '@casl/ability/extra';
import {
  AppAbilityDto,
  CaslActionsDto,
  CaslSubjectsDto,
  ConditionsDto,
} from './casl.dto';

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
  return (query ?? {}) as Record<string, unknown>;
}
