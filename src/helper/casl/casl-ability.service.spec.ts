import { Types } from 'mongoose';
import { CaslAbilityService } from './casl-ability.service';

/**
 * Where a staff member's authority comes from.
 *
 * The two grants are different records: `UserRole` is a role held everywhere,
 * `OfficeUser` is a posting at one branch. Only the first used to be read, so
 * anybody whose only role was a branch posting — every Office Manager, every
 * Cashier assigned from the office page — got an empty ability and a 403 on
 * every screen.
 */
describe('CaslAbilityService', () => {
  const userId = new Types.ObjectId();
  const roleId = new Types.ObjectId();
  const officeId = new Types.ObjectId();
  const requestOffice = new Types.ObjectId();

  const user = { _id: userId } as never;

  /** Minimal stand-ins for the three models the service reads. */
  const build = (options: {
    userRoles?: unknown[];
    postings?: unknown[];
    rolePermissions?: unknown[];
  }) => {
    const lean = (rows: unknown[]) => ({ lean: () => Promise.resolve(rows) });

    const userRoleModel = {
      find: jest.fn(() => lean(options.userRoles ?? [])),
    };
    const officeUserModel = {
      find: jest.fn(() => lean(options.postings ?? [])),
    };
    const rolePermissionModel = {
      find: jest.fn(() => ({
        populate: () => lean(options.rolePermissions ?? []),
      })),
    };

    const service = new CaslAbilityService(
      userRoleModel as never,
      rolePermissionModel as never,
      officeUserModel as never,
    );

    return { service, officeUserModel };
  };

  /** One seeded row: READ Order, confined to whichever office `$office` is. */
  const readOrderInOffice = {
    roleId,
    conditions: { officeId: '$office' },
    permissionId: { action: 'READ', subject: 'Order', isActive: true },
  };

  it('grants a role that reaches the user only through an office posting', async () => {
    const { service } = build({
      postings: [{ roleId, officeId, isActive: true }],
      rolePermissions: [readOrderInOffice],
    });

    const ability = await service.createForUser(user);

    expect(ability.can('READ', 'Order')).toBe(true);
  });

  it('scopes a posting to its own branch, not the office of the request', async () => {
    const { service } = build({
      postings: [{ roleId, officeId, isActive: true }],
      rolePermissions: [readOrderInOffice],
    });

    // Nothing in the admin panel sets the request office, so it falls back to
    // a default branch. A posting must not follow it.
    const ability = await service.createForUser(user, {
      office: requestOffice.toString(),
    });

    const rule = ability.rulesFor('READ', 'Order')[0];
    expect(rule.conditions).toEqual({ officeId: officeId.toString() });
  });

  it('ignores a posting that has been revoked', async () => {
    const { service, officeUserModel } = build({
      postings: [],
      rolePermissions: [readOrderInOffice],
    });

    const ability = await service.createForUser(user);

    // A revoke flags the posting inactive and keeps the row for the audit
    // trail, so the query — not the row's absence — is what excludes it.
    expect(officeUserModel.find).toHaveBeenCalledWith({
      userId,
      isActive: true,
    });
    expect(ability.can('READ', 'Order')).toBe(false);
  });

  it('keeps both readings when a role is held globally and posted at a branch', async () => {
    const { service } = build({
      userRoles: [{ roleId }],
      postings: [{ roleId, officeId, isActive: true }],
      rolePermissions: [readOrderInOffice],
    });

    const ability = await service.createForUser(user, {
      office: requestOffice.toString(),
    });

    // Order is CASL's business — what matters is that neither grant swallowed
    // the other, so the person can read both their branch and the request's.
    expect(
      ability.rulesFor('READ', 'Order').map((rule) => rule.conditions),
    ).toEqual(
      expect.arrayContaining([
        { officeId: requestOffice.toString() },
        { officeId: officeId.toString() },
      ]),
    );
  });

  it('gives no authority at all when there is no grant of either kind', async () => {
    const { service } = build({ rolePermissions: [readOrderInOffice] });

    const ability = await service.createForUser(user);

    expect(ability.can('READ', 'Order')).toBe(false);
  });
});
