import { AbilityBuilder } from '@casl/ability';
import { Types } from 'mongoose';
import { AppAbility } from './casl.dto';
import { scopeFilter } from './casl-scope';

describe('scopeFilter', () => {
  it('returns {} when the caller has an unrestricted rule (e.g. GLOBAL)', () => {
    const { can, build } = new AbilityBuilder(AppAbility);
    can('READ', 'Order');
    const ability = build();

    expect(scopeFilter(ability, 'READ', 'Order')).toEqual({});
  });

  it('returns the conditions as a filter when the rule is scoped', () => {
    const { can, build } = new AbilityBuilder(AppAbility);
    can('READ', 'Order', { customerId: 'cust-1' } as never);
    const ability = build();

    expect(scopeFilter(ability, 'READ', 'Order')).toEqual({
      $or: [{ customerId: 'cust-1' }],
    });
  });

  it('scopes office-owned rules to the office', () => {
    const { can, build } = new AbilityBuilder(AppAbility);
    can('READ', 'Payment', { officeId: 'office-1' } as never);
    const ability = build();

    expect(scopeFilter(ability, 'READ', 'Payment')).toEqual({
      $or: [{ officeId: 'office-1' }],
    });
  });

  it('casts 24-hex id conditions to ObjectId (so $or/aggregate match)', () => {
    const officeId = new Types.ObjectId().toString();
    const { can, build } = new AbilityBuilder(AppAbility);
    can('READ', 'Order', { officeId } as never);
    const ability = build();

    const filter = scopeFilter(ability, 'READ', 'Order') as {
      $or: { officeId: unknown }[];
    };
    expect(filter.$or[0].officeId).toBeInstanceOf(Types.ObjectId);
    expect(String(filter.$or[0].officeId)).toBe(officeId);
  });

  it('returns an impossible filter when the caller cannot access the subject', () => {
    const { can, build } = new AbilityBuilder(AppAbility);
    can('READ', 'Order', { customerId: 'cust-1' } as never);
    const ability = build();

    // Different subject the caller has no rule for → match nothing.
    expect(scopeFilter(ability, 'READ', 'Payment')).toEqual({
      _id: { $in: [] },
    });
  });
});
