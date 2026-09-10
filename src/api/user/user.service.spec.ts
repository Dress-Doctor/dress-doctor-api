import { BadRequestException, ConflictException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { AppUtilService } from 'src/helper/service/app-util.service';
import { CodeGeneratorService } from 'src/helper/service/code-generator.service';
import { Role } from 'src/schema/admin/role.schema';
import { RolePermission } from 'src/schema/admin/role-permission.schema';
import { UserRole } from 'src/schema/admin/user-role.schema';
import { UserHistory } from 'src/schema/user/user-history.schema';
import { HistoryLabelService } from 'src/helper/service/history-label.service';
import { Office } from 'src/schema/office/office.schema';
import { OfficeUser } from 'src/schema/office/office-user.schema';
import { Customer } from 'src/schema/user/customer.schema';
import { UserType } from 'src/schema/user/user-type.schema';
import { User } from 'src/schema/user/user.schema';
import { CreateUserDto } from './dto/create-user.dto';
import { ExportUserDto, UserExportFormatEnum } from './dto/export-user.dto';
import { FindAllUserDto } from './dto/find-all-user.dto';
import { UserService } from './user.service';
import { ActivityService } from 'src/helper/service/activity.service';

/** `find()` is chained: .select().populate().sort().skip().limit().lean(). */
type FindChain = {
  select: jest.Mock;
  populate: jest.Mock;
  sort: jest.Mock;
  skip: jest.Mock;
  limit: jest.Mock;
  lean: jest.Mock;
};

/** `.select().lean()` — how a resolve-by-reference read is shaped. */
type LeanChain = { select: jest.Mock; lean: jest.Mock };

/** `.select().populate()` — how the update read-back is shaped. */
type UpdateChain = { select: jest.Mock; populate: jest.Mock };

/**
 * A query mock that is awaited as well as chained: `.populate()` returns
 * itself so a caller can chain twice, and `then` makes the query itself
 * awaitable. Stated rather than inferred — the object refers to itself inside
 * its own initializer, which TypeScript cannot resolve on its own.
 */
type AwaitableChain = {
  populate: jest.Mock;
  select?: jest.Mock;
  lean?: jest.Mock;
  then: (resolve: (value: unknown) => unknown) => unknown;
};

/**
 * The global-roles query. Two readers share it: `listRoles` awaits
 * `.find().populate()[.populate()]`, while `rolesForUsers` — what the staff
 * list uses to name everybody's role — ends the same chain with `.lean()`.
 */
const rolesRows = (rows: unknown[]) => {
  const link: AwaitableChain = {
    populate: jest.fn(() => link),
    lean: jest.fn().mockResolvedValue(rows),
    then: (resolve: (value: unknown) => unknown) => resolve(rows),
  };
  return link;
};

/** The postings query, which three readers share — see `officeUserModel`. */
const postingRows = (rows: unknown[]) => {
  const link: AwaitableChain = {
    populate: jest.fn(() => link),
    lean: jest.fn().mockResolvedValue(rows),
    select: jest.fn(() => ({ lean: jest.fn().mockResolvedValue(rows) })),
    then: (resolve: (value: unknown) => unknown) => resolve(rows),
  };
  return link;
};

describe('UserService', () => {
  let service: UserService;
  let userModel: {
    find: jest.Mock;
    findOne: jest.Mock;
    countDocuments: jest.Mock;
    findById: jest.Mock;
    exists: jest.Mock;
    findOneAndUpdate: jest.Mock;
    aggregate: jest.Mock;
  };
  let escapeRegex: jest.Mock;
  let userTypeModel: { findOne: jest.Mock };
  let roleModel: { findById: jest.Mock };
  let officeModel: { findById: jest.Mock };
  let userRoleModel: {
    find: jest.Mock;
    findOneAndUpdate: jest.Mock;
    deleteOne: jest.Mock;
  };
  let officeUserModel: {
    find: jest.Mock;
    findOneAndUpdate: jest.Mock;
    deleteMany: jest.Mock;
  };
  let rolePermissionModel: { find: jest.Mock };
  let userHistoryModel: { aggregate: jest.Mock };
  let labelChanges: jest.Mock;

  const id = new Types.ObjectId().toString();
  const objectId = new Types.ObjectId(id);
  const adminTypeId = new Types.ObjectId();
  const reference = 'US-8KQTMR';

  beforeEach(async () => {
    const chain: FindChain = {
      select: jest.fn(() => chain),
      populate: jest.fn(() => chain),
      sort: jest.fn(() => chain),
      skip: jest.fn(() => chain),
      limit: jest.fn(() => chain),
      // `findAll` reads the page lean so it can attach each person's roles.
      lean: jest.fn().mockResolvedValue([{ _id: objectId }]),
    };

    // `resolveUserId` reads .findOne().select().lean().
    const resolveChain: LeanChain = {
      select: jest.fn(() => resolveChain),
      lean: jest.fn().mockResolvedValue({ _id: objectId }),
    };

    // `update` returns .findOneAndUpdate().select().populate(), awaited.
    const updateChain: UpdateChain = {
      select: jest.fn(() => updateChain),
      populate: jest.fn().mockResolvedValue({ _id: id, reference }),
    };

    userModel = {
      find: jest.fn(() => chain),
      findOne: jest.fn(() => resolveChain),
      countDocuments: jest.fn().mockResolvedValue(1),
      findById: jest.fn(() => chain),
      exists: jest.fn().mockResolvedValue(null),
      findOneAndUpdate: jest.fn(() => updateChain),
      aggregate: jest.fn().mockResolvedValue([]),
    };
    escapeRegex = jest.fn((value: string) =>
      value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    );
    // `adminTypeId` reads .findOne().select().lean(); `newUser` awaits the
    // query itself, without a projection.
    userTypeModel = {
      findOne: jest.fn(() => ({
        select: jest.fn(() => ({
          lean: jest.fn().mockResolvedValue({ _id: adminTypeId }),
        })),
        then: (resolve: (value: unknown) => unknown) =>
          resolve({ _id: adminTypeId, userTypeName: 'ADMIN' }),
      })),
    };
    roleModel = { findById: jest.fn().mockResolvedValue({ _id: id }) };
    officeModel = { findById: jest.fn().mockResolvedValue({ _id: id }) };

    userRoleModel = {
      find: jest.fn(() => rolesRows([])),
      findOneAndUpdate: jest.fn().mockResolvedValue(undefined),
      deleteOne: jest.fn().mockResolvedValue(undefined),
    };
    officeUserModel = {
      // Two readers share this one query. `findHistory` takes
      // .find().select().lean(); `listRoles` takes .find().populate() twice
      // and awaits the query itself. Both end at an empty list.
      find: jest.fn(() => postingRows([])),
      findOneAndUpdate: jest.fn().mockResolvedValue(undefined),
      deleteMany: jest.fn().mockResolvedValue(undefined),
    };
    rolePermissionModel = {
      find: jest.fn(() => ({
        populate: jest.fn(() => ({ lean: jest.fn().mockResolvedValue([]) })),
      })),
    };
    userHistoryModel = { aggregate: jest.fn().mockResolvedValue([]) };
    labelChanges = jest.fn((_model: string, rows: unknown[]) =>
      Promise.resolve(rows),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        // The trail observes these services; it never changes what they do.
        {
          provide: ActivityService,
          useValue: {
            record: jest.fn().mockResolvedValue(undefined),
            recordAuth: jest.fn().mockResolvedValue(undefined),
            recordFromRequest: jest.fn().mockResolvedValue(undefined),
          },
        },
        UserService,
        {
          provide: AppUtilService,
          useValue: {
            escapeRegex,
            parseSortParam: () => ({}),
            parseRangeEnd: (value?: string) => {
              if (!value) return undefined;
              const end = new Date(value);
              if (/^\d{4}-\d{2}-\d{2}$/.test(value))
                end.setUTCHours(23, 59, 59, 999);
              return end;
            },
          },
        },
        { provide: CodeGeneratorService, useValue: {} },
        {
          provide: REQUEST,
          useValue: {
            data: { platform: 'WEB' },
            user: {
              phone: '600000000',
              userId: id,
              ability: { can: () => true },
            },
          },
        },
        { provide: getModelToken(User.name), useValue: userModel },
        { provide: getModelToken(UserType.name), useValue: userTypeModel },
        { provide: getModelToken(Customer.name), useValue: {} },
        { provide: getModelToken(Role.name), useValue: roleModel },
        { provide: getModelToken(UserRole.name), useValue: userRoleModel },
        { provide: getModelToken(Office.name), useValue: officeModel },
        { provide: getModelToken(OfficeUser.name), useValue: officeUserModel },
        {
          provide: getModelToken(RolePermission.name),
          useValue: rolePermissionModel,
        },
        {
          provide: getModelToken(UserHistory.name),
          useValue: userHistoryModel,
        },
        {
          provide: HistoryLabelService,
          useValue: { labelChanges },
        },
      ],
    }).compile();

    service = await module.resolve<UserService>(UserService);
  });

  describe('newUser', () => {
    const body = (extra: Record<string, unknown> = {}) =>
      ({
        userTypeId: adminTypeId.toString(),
        firstName: 'Jane',
        lastName: 'Ngassa',
        phone: '698765294',
        password: 'Admin@12345',
        ...extra,
      }) as CreateUserDto;

    it('refuses a type that is not staff', async () => {
      userTypeModel.findOne.mockReturnValue({
        then: (resolve: (value: unknown) => unknown) =>
          resolve({ _id: new Types.ObjectId(), userTypeName: 'CUSTOMER' }),
      });

      // The old CUSTOMER branch minted a referralCode and no customerCode,
      // which the schema requires and indexes unique and non-sparse. Refusing
      // sends the caller to /v1/customers, which writes the pair properly.
      await expect(service.newUser(body())).rejects.toThrow(
        BadRequestException,
      );
      expect(userModel.findOne).not.toHaveBeenCalled();
    });

    it('refuses a staff account with no password', async () => {
      await expect(
        service.newUser(body({ password: undefined })),
      ).rejects.toThrow('Password is required to create a staff account');
      expect(userModel.findOne).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    const query = (extra: Partial<FindAllUserDto> = {}) =>
      ({ page: 1, size: 10, ...extra }) as FindAllUserDto;

    const whereOf = (mock: jest.Mock) =>
      (mock.mock.calls as unknown as Array<[Record<string, unknown>]>)[0][0];

    it('scopes to ADMIN and nothing else when no filter is given', async () => {
      await service.findAll(query());

      // The type is the scope this module lives in, not a filter a caller
      // may pass — customers are read through /v1/customers.
      expect(whereOf(userModel.find)).toEqual({ userTypeId: adminTypeId });
      expect(userTypeModel.findOne).toHaveBeenCalledWith({
        userTypeName: 'ADMIN',
      });
      expect(escapeRegex).not.toHaveBeenCalled();
    });

    it('keeps the ADMIN scope whatever else is filtered', async () => {
      await service.findAll(query({ q: 'jane', isActive: true }));

      expect(whereOf(userModel.find).userTypeId).toEqual(adminTypeId);
    });

    it('matches nothing when no ADMIN type is seeded', async () => {
      userTypeModel.findOne.mockReturnValue({
        select: jest.fn(() => ({ lean: jest.fn().mockResolvedValue(null) })),
      });

      await service.findAll(query());

      // An unmatched id, never a dropped filter: a missing seed must return
      // nothing rather than the whole identity table.
      const scope = whereOf(userModel.find).userTypeId as Types.ObjectId;
      expect(scope).toBeInstanceOf(Types.ObjectId);
      expect(scope.equals(adminTypeId)).toBe(false);
    });

    it('never selects the password hash', async () => {
      await service.findAll(query());

      const { select } = userModel.find.mock.results[0].value as FindChain;
      const projection = (select.mock.calls as unknown as [string][])[0][0];
      // An allow-list, so a secret the schema grows next cannot slip through.
      expect(projection).not.toContain('passwordHash');
      expect(projection).toContain('reference');
    });

    it('searches reference, names, email, phone and whatsapp phone', async () => {
      await service.findAll(query({ q: 'jane' }));

      const rx = new RegExp('jane', 'i');
      expect(whereOf(userModel.find).$or).toEqual([
        { reference: rx },
        { firstName: rx },
        { lastName: rx },
        { email: rx },
        { phone: rx },
        { whatsappPhone: rx },
      ]);
    });

    it('escapes regex metacharacters in q', async () => {
      await service.findAll(query({ q: 'a+b(c)' }));

      expect(escapeRegex).toHaveBeenCalledWith('a+b(c)');
      const or = whereOf(userModel.find).$or as Array<{ reference: RegExp }>;
      expect(or[0].reference.source).toBe('a\\+b\\(c\\)');
      expect(or[0].reference.flags).toBe('i');
    });

    it('turns the date pair into a createdAt range, end of day included', async () => {
      await service.findAll(
        query({ startDate: '2026-07-01', endDate: '2026-08-05' }),
      );

      const createdAt = whereOf(userModel.find).createdAt as {
        $gte: Date;
        $lte: Date;
      };
      expect(createdAt.$gte).toEqual(new Date('2026-07-01'));
      expect(createdAt.$lte.toISOString()).toBe('2026-08-05T23:59:59.999Z');
    });

    it('takes one bound on its own', async () => {
      await service.findAll(query({ startDate: '2026-07-01' }));

      expect(whereOf(userModel.find).createdAt).toEqual({
        $gte: new Date('2026-07-01'),
      });
    });

    it('filters by status when isActive is given', async () => {
      await service.findAll(query({ isActive: false }));
      expect(whereOf(userModel.find).isActive).toBe(false);
    });

    it('counts with the same filter it queries with', async () => {
      await service.findAll(query({ q: 'jane' }));

      expect(whereOf(userModel.countDocuments)).toEqual(
        whereOf(userModel.find),
      );
    });

    it('returns the pagination envelope', async () => {
      userModel.countDocuments.mockResolvedValue(25);

      const result = await service.findAll(query({ page: 1, size: 10 }));

      // Every row carries its roles, so the staff list can say what each
      // person is without opening their account. Nobody granted anything gets
      // an empty list rather than a missing key.
      expect(result).toEqual({
        total: 25,
        data: [{ _id: objectId, roles: [] }],
        nextPage: 2,
      });
    });

    it('names the roles each person holds, global and per-branch', async () => {
      const globalRole = new Types.ObjectId();
      const officeRole = new Types.ObjectId();
      userModel.countDocuments.mockResolvedValue(1);
      userRoleModel.find.mockReturnValueOnce(
        rolesRows([
          {
            userId: objectId,
            roleId: { _id: globalRole, roleName: 'Co-Founder' },
          },
        ]),
      );
      officeUserModel.find.mockReturnValueOnce(
        postingRows([
          {
            userId: objectId,
            roleId: { _id: officeRole, roleName: 'Cashier' },
            officeId: { officeCode: 'DD-105', officeName: 'DD 105 BONADALE' },
          },
        ]),
      );

      const result = await service.findAll(query({ page: 1, size: 10 }));

      expect(result.data[0].roles).toEqual([
        { roleName: 'Co-Founder', scope: 'GLOBAL' },
        {
          roleName: 'Cashier',
          scope: 'OFFICE',
          officeCode: 'DD-105',
          officeName: 'DD 105 BONADALE',
        },
      ]);
    });

    it('leaves out a posting that has been revoked', async () => {
      userModel.countDocuments.mockResolvedValue(1);

      await service.findAll(query({ page: 1, size: 10 }));

      // Revoking flags the row inactive and keeps it for the audit trail, so
      // the query is what has to exclude it.
      expect(officeUserModel.find).toHaveBeenCalledWith({
        userId: { $in: [objectId] },
        isActive: true,
      });
    });
  });

  describe('getUserKpis', () => {
    it('reports the standing counts apart from the windowed ones', async () => {
      userModel.countDocuments
        .mockResolvedValueOnce(12) // totalStaff — window + status
        .mockResolvedValueOnce(3); // totalNew — window only
      userModel.aggregate
        // byStatusCount, over the window
        .mockResolvedValueOnce([
          { _id: true, n: 10 },
          { _id: false, n: 2 },
        ])
        // the standing split, without it
        .mockResolvedValueOnce([
          { _id: true, n: 22 },
          { _id: false, n: 2 },
        ]);

      const result = await service.getUserKpis({
        startDate: '2026-08-01',
      } as FindAllUserDto);

      expect(result).toEqual({
        totalStaff: 12,
        totalActive: 22,
        totalInactive: 2,
        totalNew: 3,
        byStatusCount: { all: 12, active: 10, inactive: 2 },
      });
    });

    it('counts staff only', async () => {
      await service.getUserKpis({} as FindAllUserDto);

      const matches = (
        userModel.countDocuments.mock.calls as unknown as Array<
          [Record<string, unknown>]
        >
      ).map((call) => call[0].userTypeId);
      expect(matches).toEqual([adminTypeId, adminTypeId]);
    });

    it('counts a missing status group as zero', async () => {
      userModel.aggregate.mockResolvedValue([{ _id: true, n: 4 }]);

      const result = await service.getUserKpis({} as FindAllUserDto);

      expect(result.byStatusCount).toEqual({ all: 4, active: 4, inactive: 0 });
      expect(result.totalInactive).toBe(0);
    });
  });

  describe('exportUsers', () => {
    const query = (extra: Partial<ExportUserDto> = {}) =>
      ({ format: UserExportFormatEnum.CSV, ...extra }) as ExportUserDto;

    it('builds a csv over the same filters as the list', async () => {
      userModel.aggregate.mockResolvedValue([
        { reference, firstName: 'Jane', lastName: 'Doe' },
      ]);

      const result = await service.exportUsers(query({ q: 'jane' }));

      expect(result.contentType).toBe('text/csv');
      expect(result.filename).toMatch(/^users-export-\d{8}\.csv$/);
      const pipeline = (
        userModel.aggregate.mock.calls as unknown as Array<
          [Array<{ $match?: Record<string, unknown> }>]
        >
      )[0][0];
      expect(pipeline[0].$match?.$or).toHaveLength(6);
      expect(pipeline[0].$match?.userTypeId).toEqual(adminTypeId);
    });

    it('never projects the password hash', async () => {
      await service.exportUsers(query());

      const pipeline = (
        userModel.aggregate.mock.calls as unknown as Array<
          [Array<{ $project?: Record<string, unknown> }>]
        >
      )[0][0];
      const project = pipeline.find((stage) => stage.$project)?.$project ?? {};
      expect(Object.keys(project)).not.toContain('passwordHash');
    });

    it('builds an xlsx when excel is asked for', async () => {
      const result = await service.exportUsers(
        query({ format: UserExportFormatEnum.EXCEL }),
      );

      expect(result.filename).toMatch(/^users-export-\d{8}\.xlsx$/);
      expect(result.contentType).toContain('spreadsheetml');
    });
  });

  describe('addressing a staff member', () => {
    const whereOfFindOne = () =>
      (
        userModel.findOne.mock.calls as unknown as Array<
          [{ reference?: string; $or?: Array<Record<string, unknown>> }]
        >
      )[0][0];

    it('looks a staff member up by its reference', async () => {
      await service.findOne(reference);

      expect(userModel.findOne).toHaveBeenCalledWith({
        reference,
        userTypeId: adminTypeId,
      });
    });

    it('uppercases a reference typed in lower case', async () => {
      await service.findOne('us-8kqtmr');

      expect(whereOfFindOne().reference).toBe(reference);
    });

    it('still accepts a mongo id, for callers on the old routes', async () => {
      await service.findOne(id);

      expect(whereOfFindOne().$or).toHaveLength(2);
    });

    it('refuses to open a customer, whichever way it is addressed', async () => {
      // The scope rides on every by-reference read, so a customer's own id
      // handed to this route is a 404 rather than a way round /v1/customers.
      await service.findOne(id);

      expect(whereOfFindOne()).toMatchObject({ userTypeId: adminTypeId });
    });
  });

  describe('update', () => {
    it('rejects a duplicate email', async () => {
      userModel.exists.mockResolvedValue({ _id: new Types.ObjectId() });

      await expect(
        service.update(reference, { email: 'taken@example.com' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('assignRole', () => {
    it('assigns a global role via UserRole when no office', async () => {
      await service.assignRole(reference, { roleId: id });

      expect(userRoleModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
      expect(officeUserModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('assigns a per-office role via OfficeUser when officeId given', async () => {
      await service.assignRole(reference, { roleId: id, officeId: id });

      expect(officeUserModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
      expect(userRoleModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('rejects an invalid role', async () => {
      roleModel.findById.mockResolvedValue(null);

      await expect(
        service.assignRole(reference, { roleId: id }),
      ).rejects.toThrow('Invalid role id');
    });
  });

  describe('revokeRole', () => {
    it('clears both UserRole and OfficeUser rows', async () => {
      await service.revokeRole(reference, id);
      expect(userRoleModel.deleteOne).toHaveBeenCalledTimes(1);
      expect(officeUserModel.deleteMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('listRoles', () => {
    const roleId = new Types.ObjectId();

    /** One grant, populated the way mongoose hands it back. */
    const grant = (rows: unknown[]) => {
      const link: AwaitableChain = {
        populate: jest.fn(() => link),
        then: (resolve: (value: unknown) => unknown) => resolve(rows),
      };
      return link;
    };

    it('attaches each role`s permissions', async () => {
      userRoleModel.find.mockReturnValue(
        grant([{ _id: new Types.ObjectId(), roleId: { _id: roleId } }]),
      );
      rolePermissionModel.find.mockReturnValue({
        populate: jest.fn(() => ({
          lean: jest.fn().mockResolvedValue([
            {
              _id: new Types.ObjectId(),
              roleId,
              scope: 'OFFICE',
              permissionId: { action: 'READ', subject: 'Order' },
            },
          ]),
        })),
      });

      const result = await service.listRoles(reference);

      expect(result.roles[0].permissions).toEqual([
        expect.objectContaining({
          action: 'READ',
          subject: 'Order',
          scope: 'OFFICE',
        }),
      ]);
    });

    it('drops a permission row whose permission is gone', async () => {
      userRoleModel.find.mockReturnValue(
        grant([{ _id: new Types.ObjectId(), roleId: { _id: roleId } }]),
      );
      rolePermissionModel.find.mockReturnValue({
        populate: jest.fn(() => ({
          lean: jest.fn().mockResolvedValue([
            {
              _id: new Types.ObjectId(),
              roleId,
              scope: 'GLOBAL',
              permissionId: null,
            },
          ]),
        })),
      });

      const result = await service.listRoles(reference);
      expect(result.roles[0].permissions).toEqual([]);
    });

    it('counts a permission held twice only once', async () => {
      const otherRoleId = new Types.ObjectId();
      userRoleModel.find.mockReturnValue(
        grant([
          { _id: new Types.ObjectId(), roleId: { _id: roleId } },
          { _id: new Types.ObjectId(), roleId: { _id: otherRoleId } },
        ]),
      );
      rolePermissionModel.find.mockReturnValue({
        populate: jest.fn(() => ({
          lean: jest.fn().mockResolvedValue([
            {
              _id: new Types.ObjectId(),
              roleId,
              scope: 'OFFICE',
              permissionId: { action: 'READ', subject: 'Order' },
            },
            {
              _id: new Types.ObjectId(),
              roleId: otherRoleId,
              scope: 'GLOBAL',
              permissionId: { action: 'READ', subject: 'Order' },
            },
          ]),
        })),
      });

      const result = await service.listRoles(reference);
      expect(result.permissionCount).toBe(1);
    });
  });

  describe('findHistory', () => {
    it('merges the account trail with the posting trail', async () => {
      userHistoryModel.aggregate.mockResolvedValue([
        {
          counted: [{ n: 2 }],
          rows: [
            { source: 'account', action: 'UPDATE', changes: [] },
            { source: 'posting', action: 'CREATE', changes: [] },
          ],
        },
      ]);

      const result = await service.findHistory(reference, {
        page: 1,
        size: 10,
      } as never);

      expect(result.total).toBe(2);
      expect(result.data).toHaveLength(2);

      // Each trail is labelled against its own schema — the refs to resolve
      // come off different definitions.
      expect(labelChanges).toHaveBeenCalledWith(User.name, [
        expect.objectContaining({ source: 'account' }),
      ]);
      expect(labelChanges).toHaveBeenCalledWith(OfficeUser.name, [
        expect.objectContaining({ source: 'posting' }),
      ]);
    });

    it('reports no next page on the last one', async () => {
      userHistoryModel.aggregate.mockResolvedValue([
        { counted: [{ n: 2 }], rows: [] },
      ]);

      const result = await service.findHistory(reference, {
        page: 1,
        size: 10,
      } as never);
      expect(result.nextPage).toBeNull();
    });

    it('answers an empty trail rather than throwing', async () => {
      userHistoryModel.aggregate.mockResolvedValue([]);

      const result = await service.findHistory(reference, {
        page: 1,
        size: 10,
      } as never);
      expect(result).toEqual({ total: 0, data: [], nextPage: null });
    });
  });

  describe('deactivate and reactivate', () => {
    const statusOf = (call: number) =>
      (
        userModel.findOneAndUpdate.mock.calls as unknown as Array<
          [unknown, { isActive: boolean }]
        >
      )[call][1].isActive;

    it('soft-deactivates the user', async () => {
      await service.deactivate(reference);

      expect(userModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
      expect(statusOf(0)).toBe(false);
    });

    it('puts a deactivated user back to work', async () => {
      await service.reactivate(reference);

      expect(userModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
      expect(statusOf(0)).toBe(true);
    });
  });
});
