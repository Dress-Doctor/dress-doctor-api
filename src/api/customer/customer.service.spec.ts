import { AbilityBuilder } from '@casl/ability';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { AppAbility } from 'src/helper/casl/casl.dto';
import { AppUtilService } from 'src/helper/service/app-util.service';
import { CodeGeneratorService } from 'src/helper/service/code-generator.service';
import { Customer } from 'src/schema/user/customer.schema';
import { Referral } from 'src/schema/user/referral.schema';
import { UserType } from 'src/schema/user/user-type.schema';
import { User } from 'src/schema/user/user.schema';
import { Office } from 'src/schema/office/office.schema';
import { Order } from 'src/schema/order/order.schema';
import { Payment } from 'src/schema/payment/payment.schema';
import { PickupRequest } from 'src/schema/pickup/pickup-request.schema';
import { RewardTier } from 'src/schema/reward/reward-tier.schema';
import { CustomerHistory } from 'src/schema/user/customer-history.schema';
import { HistoryLabelService } from 'src/helper/service/history-label.service';
import { Subscription } from 'src/schema/subscription/subscription.schema';
import { RewardService } from '../reward/reward.service';
import { PreferredLanguageEnum } from 'src/schema/user/user.dto';
import { CustomerService, DEFAULT_INACTIVE_DAYS } from './customer.service';
import {
  CustomerExportFormatEnum,
  ExportCustomerDto,
} from './dto/export-customer.dto';
import { FindCustomerDto } from './dto/find-customer.dto';

// A constructor mock that also carries Mongoose statics (exists/findOne/...).
type DocFactory = (data: Record<string, unknown>) => Record<string, unknown>;
const modelMock = (factory: DocFactory) => {
  const ctor = jest.fn().mockImplementation(factory) as jest.Mock & {
    exists: jest.Mock;
    findOne: jest.Mock;
    findById: jest.Mock;
    aggregate: jest.Mock;
    findOneAndUpdate: jest.Mock;
  };
  ctor.exists = jest.fn();
  ctor.findOne = jest.fn();
  ctor.findById = jest.fn();
  ctor.aggregate = jest.fn();
  ctor.findOneAndUpdate = jest.fn();
  return ctor;
};

/** An unrestricted staff ability — what most of these tests run as. */
const manageAllAbility = () => {
  const { can, build } = new AbilityBuilder(AppAbility);
  can('manage', 'all');
  return build();
};

/**
 * A customer's own ability, exactly as seeded: READ Customer conditioned on
 * `{ userId: '$self' }`, resolved to the caller's user id at build time.
 */
const selfScopedAbility = (userId: string) => {
  const { can, build } = new AbilityBuilder(AppAbility);
  // `as never` matches the repo's other CASL specs: the builder's condition
  // type is keyed off the subject's shape, which these string subjects lack.
  can('READ', 'Customer', { userId } as never);
  can('EXPORT', 'Customer', { userId } as never);
  return build();
};

describe('CustomerService', () => {
  let service: CustomerService;
  let userModel: ReturnType<typeof modelMock>;
  let customerModel: ReturnType<typeof modelMock>;
  let referralModel: ReturnType<typeof modelMock>;
  let userTypeModel: ReturnType<typeof modelMock>;
  let officeModel: { findOne: jest.Mock };
  let orderModel: { aggregate: jest.Mock; countDocuments: jest.Mock };
  let pickupRequestModel: { aggregate: jest.Mock };
  // Held as a mutable object so a test can swap the caller's ability after the
  // request-scoped service has been resolved.
  let mockRequest: {
    data: { platform: string; reason: string };
    user: {
      phone: string;
      userId: string;
      ability: ReturnType<typeof AppAbility>;
    };
  };
  let codeService: {
    generateCustomerCode: jest.Mock;
    generateReferralCode: jest.Mock;
  };

  const doc = (data: Record<string, unknown>) => ({
    ...data,
    _id: new Types.ObjectId(),
    $locals: {} as Record<string, unknown>,
    save: jest.fn().mockResolvedValue(undefined),
  });

  const validPayload = {
    firstName: 'Ada',
    lastName: 'Deo',
    phone: '698765294',
    whatsappPhone: '698765294',
  };

  beforeEach(async () => {
    userModel = modelMock(doc);
    customerModel = modelMock(doc);
    referralModel = modelMock(doc);
    userTypeModel = modelMock(doc);
    officeModel = {
      findOne: jest.fn().mockReturnValue({
        select: () => ({ lean: () => Promise.resolve(null) }),
      }),
    };
    orderModel = {
      aggregate: jest.fn().mockResolvedValue([]),
      countDocuments: jest.fn().mockResolvedValue(0),
    };
    pickupRequestModel = { aggregate: jest.fn().mockResolvedValue([]) };

    userModel.exists.mockResolvedValue(null);
    customerModel.findOne.mockResolvedValue(null);
    userTypeModel.findOne.mockResolvedValue({ _id: new Types.ObjectId() });

    codeService = {
      generateCustomerCode: jest.fn().mockResolvedValue('CU-ABC123'),
      generateReferralCode: jest.fn().mockResolvedValue('REF456'),
    };

    mockRequest = {
      data: {
        platform: 'WEB',
        reason: 'customer called to correct the address',
      },
      user: {
        phone: '600000000',
        userId: new Types.ObjectId().toString(),
        ability: manageAllAbility(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomerService,
        {
          provide: AppUtilService,
          useValue: Object.assign(new AppUtilService(), {
            escapeRegex: (s: string) => s,
            parseSortParam: () => ({ createdAt: -1 }),
          }),
        },
        { provide: CodeGeneratorService, useValue: codeService },
        { provide: REQUEST, useValue: mockRequest },
        { provide: getModelToken(User.name), useValue: userModel },
        { provide: getModelToken(UserType.name), useValue: userTypeModel },
        { provide: getModelToken(Customer.name), useValue: customerModel },
        { provide: getModelToken(Referral.name), useValue: referralModel },
        { provide: getModelToken(Order.name), useValue: orderModel },
        { provide: getModelToken(Office.name), useValue: officeModel },
        { provide: getModelToken(Subscription.name), useValue: {} },
        { provide: getModelToken(Payment.name), useValue: {} },
        {
          provide: getModelToken(PickupRequest.name),
          useValue: pickupRequestModel,
        },
        { provide: getModelToken(CustomerHistory.name), useValue: {} },
        { provide: getModelToken(RewardTier.name), useValue: {} },
        { provide: HistoryLabelService, useValue: { labelChanges: jest.fn() } },
        { provide: RewardService, useValue: {} },
      ],
    }).compile();

    service = await module.resolve<CustomerService>(CustomerService);
  });

  it('registers: creates a User + Customer and returns both codes', async () => {
    const res = await service.register(validPayload);

    expect(userModel).toHaveBeenCalledTimes(1);
    expect(customerModel).toHaveBeenCalledTimes(1);
    expect(referralModel).not.toHaveBeenCalled();
    expect(res).toEqual({ customerCode: 'CU-ABC123', referralCode: 'REF456' });
  });

  it('links referredBy and opens a PENDING referral when a code is given', async () => {
    const referrerUserId = new Types.ObjectId();
    customerModel.findOne.mockResolvedValue({ userId: referrerUserId });

    await service.register({ ...validPayload, referralCode: 'FRIEND' });

    expect(referralModel).toHaveBeenCalledTimes(1);
    expect(referralModel).toHaveBeenCalledWith(
      expect.objectContaining({ referrerId: referrerUserId }),
    );
    // Customer created with a referredBy pointer.
    const customerCalls = customerModel.mock.calls as unknown as Array<
      [{ referredBy?: Types.ObjectId }]
    >;
    expect(customerCalls[0][0].referredBy).toBeInstanceOf(Types.ObjectId);
  });

  it('rejects an unknown referral code', async () => {
    customerModel.findOne.mockResolvedValue(null);

    await expect(
      service.register({ ...validPayload, referralCode: 'NOPE' }),
    ).rejects.toThrow(BadRequestException);
    expect(userModel).not.toHaveBeenCalled();
  });

  it('rejects a duplicate phone', async () => {
    userModel.exists.mockResolvedValue({ _id: new Types.ObjectId() });

    await expect(service.register(validPayload)).rejects.toThrow(
      ConflictException,
    );
    expect(customerModel).not.toHaveBeenCalled();
  });

  it('findInactive defaults the threshold to DEFAULT_INACTIVE_DAYS', async () => {
    const spy = jest
      .spyOn(service, 'findAll')
      .mockResolvedValue({ total: 0, data: [], nextPage: null });

    await service.findInactive({ page: 1, size: 20 } as FindCustomerDto);

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ inactiveDays: DEFAULT_INACTIVE_DAYS }),
    );
  });

  describe('phone normalisation', () => {
    it('stores a bare national number with its country code', async () => {
      await service.register(validPayload);

      const calls = userModel.mock.calls as unknown as [
        { phone: string; whatsappPhone: string },
      ][];
      expect(calls[0][0].phone).toBe('237698765294');
      expect(calls[0][0].whatsappPhone).toBe('237698765294');
    });

    it('keeps a foreign number as given', async () => {
      // A customer in Douala may keep the WhatsApp number they arrived with.
      await service.register({
        ...validPayload,
        whatsappPhone: '12025550123',
      });

      const calls = userModel.mock.calls as unknown as [
        { whatsappPhone: string },
      ][];
      expect(calls[0][0].whatsappPhone).toBe('12025550123');
    });

    it('looks for a duplicate under every stored spelling', async () => {
      await service.register(validPayload);

      // A legacy row holds the bare digits; a new one holds them prefixed.
      const [[query]] = userModel.exists.mock.calls as unknown as [
        [{ phone: { $in: string[] } }],
      ];
      expect(query.phone.$in).toEqual(
        expect.arrayContaining(['698765294', '237698765294']),
      );
    });
  });

  it('rejects a duplicate email', async () => {
    userModel.exists
      .mockResolvedValueOnce(null) // phone
      .mockResolvedValueOnce({ _id: new Types.ObjectId() }); // email

    await expect(
      service.register({ ...validPayload, email: 'taken@example.com' }),
    ).rejects.toThrow(ConflictException);
  });

  describe('findAll filters', () => {
    type Stage = Record<string, Record<string, unknown>>;

    /** Run findAll and hand back the pipeline stages it built. */
    const runFindAll = async (query: Partial<FindCustomerDto>) => {
      customerModel.aggregate.mockResolvedValue([]);
      await service.findAll({ page: 1, size: 20, ...query } as FindCustomerDto);
      const calls = customerModel.aggregate.mock.calls as unknown as [
        Stage[],
      ][];
      const stages = calls[0][0];
      const joinAt = stages.findIndex((stage) => stage.$lookup?.as === 'user');

      // Merged by side of the user join rather than read at fixed indexes: the
      // filters are split across several $match stages so the KPIs can drop
      // some of them, and a test should not encode that layout.
      const merge = (from: number, to: number) =>
        Object.assign(
          {},
          ...stages
            .slice(from, to)
            .filter((stage) => stage.$match)
            .map((stage) => stage.$match),
        ) as Record<string, unknown>;

      return {
        match: merge(0, joinAt),
        userMatch: merge(joinAt, stages.length),
        // Every filter regardless of which side of the join it sits on.
        all: merge(0, stages.length),
      };
    };

    const officeId = new Types.ObjectId();
    const foundOffice = () => {
      officeModel.findOne.mockReturnValue({
        select: () => ({ lean: () => Promise.resolve({ _id: officeId }) }),
      });
    };

    it('resolves officeCode to the home office id', async () => {
      foundOffice();

      const { match } = await runFindAll({ officeCode: ' of-dla1 ' });

      expect(officeModel.findOne).toHaveBeenCalledWith({
        officeCode: 'OF-DLA1',
      });
      expect(match.homeOfficeId).toBe(officeId);
    });

    it('matches nothing for an unknown officeCode', async () => {
      const { match } = await runFindAll({ officeCode: 'NOPE' });

      // A sentinel id, not a dropped filter — an unknown office returns none.
      expect(match.homeOfficeId).toBeInstanceOf(Types.ObjectId);
      expect(match.homeOfficeId).not.toEqual(officeId);
    });

    it('leaves registeredAt unbounded when no dates are given', async () => {
      const { all } = await runFindAll({});

      expect(all.registeredAt).toBeUndefined();
    });

    it('windows registeredAt on the given bounds, end of day inclusive', async () => {
      const { all } = await runFindAll({
        startDate: '2026-07-01',
        endDate: '2026-08-05',
      });

      const range = all.registeredAt as { $gte: Date; $lte: Date };
      expect(range.$gte.toISOString()).toBe('2026-07-01T00:00:00.000Z');
      expect(range.$lte.toISOString()).toBe('2026-08-05T23:59:59.999Z');
    });

    it('keeps an explicit endDate time as given', async () => {
      const { all } = await runFindAll({
        endDate: '2026-08-05T10:00:00.000Z',
      });

      const range = all.registeredAt as { $lte: Date };
      expect(range.$lte.toISOString()).toBe('2026-08-05T10:00:00.000Z');
    });

    it('joins the home office onto the page only, not the count', async () => {
      customerModel.aggregate.mockResolvedValue([]);
      await service.findAll({ page: 1, size: 20 } as FindCustomerDto);

      const calls = customerModel.aggregate.mock.calls as unknown as [
        Stage[],
      ][];
      const [countPipeline, dataPipeline] = [calls[0][0], calls[1][0]];

      const lookupOf = (stages: Stage[]) =>
        stages.find((stage) => stage.$lookup?.as === 'homeOfficeId');

      // Nothing filters on the office, so the count must not pay for the join.
      expect(lookupOf(countPipeline)).toBeUndefined();

      const join = lookupOf(dataPipeline);
      expect(join?.$lookup).toMatchObject({ from: 'office' });
      // The signed link is an HMAC — the allow-list must keep it out.
      const projection = (
        join?.$lookup as { pipeline: { $project: Record<string, 1> }[] }
      ).pipeline[0].$project;
      expect(projection).not.toHaveProperty('signedLink');
      expect(projection).not.toHaveProperty('qrCodeUrl');
      expect(projection).toHaveProperty('officeCode');
    });

    it('joins the referral, with the referrer resolved inside it', async () => {
      customerModel.aggregate.mockResolvedValue([]);
      await service.findAll({ page: 1, size: 20 } as FindCustomerDto);

      const calls = customerModel.aggregate.mock.calls as unknown as [
        Stage[],
      ][];
      const [countPipeline, dataPipeline] = [calls[0][0], calls[1][0]];
      const lookupOf = (stages: Stage[]) =>
        stages.find((stage) => stage.$lookup?.as === 'referredBy');

      // Page only — the count never reads the referral.
      expect(lookupOf(countPipeline)).toBeUndefined();

      const join = lookupOf(dataPipeline)?.$lookup as {
        from: string;
        pipeline: Stage[];
      };
      expect(join.from).toBe('referral');

      // A bare referral is two ids and a status; the referrer is resolved
      // inside it so a row renders without a second round trip.
      const inner = join.pipeline.find(
        (stage) => stage.$lookup?.as === 'referrerId',
      )?.$lookup as { pipeline: { $project: Record<string, 1> }[] };
      expect(inner.pipeline[0].$project).not.toHaveProperty('passwordHash');
      expect(inner.pipeline[0].$project).toHaveProperty('firstName');
    });

    it('filters on the account status, keeping false a real filter', async () => {
      const { userMatch } = await runFindAll({ isActive: false });

      expect(userMatch['user.isActive']).toBe(false);
    });

    it('returns both statuses when isActive is omitted', async () => {
      const { userMatch } = await runFindAll({});

      expect(userMatch).not.toHaveProperty('user.isActive');
    });

    it('filters on the preferred language', async () => {
      const { userMatch } = await runFindAll({
        language: PreferredLanguageEnum.ENGLISH,
      });

      expect(userMatch['user.preferredLanguage']).toBe(
        PreferredLanguageEnum.ENGLISH,
      );
    });

    it('searches q across names, email, phones and both codes', async () => {
      const { userMatch } = await runFindAll({ q: 'ada' });

      const or = userMatch.$or as Record<string, unknown>[];
      const keys = or.flatMap((clause) => Object.keys(clause));
      expect(keys).toEqual(
        expect.arrayContaining([
          'user.firstName',
          'user.lastName',
          'user.email',
          'user.phone',
          'user.whatsappPhone',
          'customerCode',
          'referralCode',
          // Full "first last" name.
          '$expr',
        ]),
      );
    });
  });

  describe('getCustomerKpis', () => {
    type Stage = Record<string, Record<string, unknown>>;

    /** The facet pass, then the active-customer pass. */
    const withCounts = (
      facet: Record<string, unknown>,
      activeCustomers = 0,
    ) => {
      customerModel.aggregate
        .mockResolvedValueOnce([facet])
        .mockResolvedValueOnce(activeCustomers ? [{ n: activeCustomers }] : []);
    };

    const emptyFacet = {
      total: [],
      newCustomers: [],
      atRisk: [],
      byStatus: [],
    };

    it('names every count and both sides of the status breakdown', async () => {
      withCounts(
        {
          total: [{ n: 128 }],
          newCustomers: [{ n: 9 }],
          atRisk: [{ n: 14 }],
          byStatus: [
            { _id: true, n: 118 },
            { _id: false, n: 10 },
          ],
        },
        23,
      );

      const res = await service.getCustomerKpis({} as FindCustomerDto);

      expect(res.totalCustomers).toBe(128);
      expect(res.newCustomers).toBe(9);
      expect(res.activeCustomers).toBe(23);
      expect(res.atRiskCustomers).toBe(14);
      expect(res.byStatus).toEqual({ active: 118, inactive: 10 });
    });

    it('reports 0 for a facet the aggregation returned empty', async () => {
      withCounts(emptyFacet);

      const res = await service.getCustomerKpis({} as FindCustomerDto);

      expect(res).toMatchObject({
        totalCustomers: 0,
        newCustomers: 0,
        activeCustomers: 0,
        atRiskCustomers: 0,
        byStatus: { active: 0, inactive: 0 },
      });
    });

    it('defaults the window to the 14 days ending today', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-08-25T09:30:00.000Z'));
      withCounts(emptyFacet);

      const { window } = await service.getCustomerKpis({} as FindCustomerDto);

      // 14 days counting today: 12 Aug → 25 Aug, per the product rule.
      expect(window.start.toISOString()).toBe('2026-08-12T00:00:00.000Z');
      expect(window.end.toISOString()).toBe('2026-08-25T09:30:00.000Z');
      expect(window.atRiskStart).toEqual(window.start);
      jest.useRealTimers();
    });

    it('measures at-risk over the 14 days ending on the range end, not the range', async () => {
      withCounts(emptyFacet);

      const { window } = await service.getCustomerKpis({
        startDate: '2026-08-01',
        endDate: '2026-08-05',
      } as FindCustomerDto);

      expect(window.start.toISOString()).toBe('2026-08-01T00:00:00.000Z');
      expect(window.end.toISOString()).toBe('2026-08-05T23:59:59.999Z');
      // The selected range is 5 days; at-risk still looks back a full 14.
      expect(window.atRiskStart.toISOString()).toBe('2026-07-23T00:00:00.000Z');
    });

    it('dates the metrics without narrowing the base, and spans both statuses', async () => {
      withCounts(emptyFacet);

      await service.getCustomerKpis({
        isActive: true,
        startDate: '2026-08-01',
        endDate: '2026-08-05',
      } as FindCustomerDto);

      const calls = customerModel.aggregate.mock.calls as unknown as [
        Stage[],
      ][];
      const stages = calls[0][0];
      const facet = stages.find((stage) => stage.$facet)?.$facet as Record<
        string,
        Stage[]
      >;

      // The range dates newCustomers; the base count must not carry it.
      const hasRegisteredAt = (branch: Stage[]) =>
        branch.some((stage) => stage.$match?.registeredAt);
      expect(hasRegisteredAt(facet.total)).toBe(false);
      expect(hasRegisteredAt(facet.newCustomers)).toBe(true);

      // A tab strip needs both counts, so the breakdown drops the isActive
      // filter the other branches keep.
      const hasStatusFilter = (branch: Stage[]) =>
        branch.some((stage) => stage.$match?.['user.isActive'] !== undefined);
      expect(hasStatusFilter(facet.total)).toBe(true);
      expect(hasStatusFilter(facet.byStatus)).toBe(false);
    });

    it('counts a customer as at-risk only once they have ordered before', async () => {
      withCounts(emptyFacet);

      await service.getCustomerKpis({
        endDate: '2026-08-05',
      } as FindCustomerDto);

      const calls = customerModel.aggregate.mock.calls as unknown as [
        Stage[],
      ][];
      const stages = calls[0][0];
      const facet = stages.find((stage) => stage.$facet)?.$facet as Record<
        string,
        Stage[]
      >;
      const atRisk = facet.atRisk.find((stage) => stage.$match?.lastOrderAt)
        ?.$match?.lastOrderAt as { $exists: boolean; $lt: Date };

      // Never ordered = a lead, not a risk.
      expect(atRisk.$exists).toBe(true);
      expect(atRisk.$lt.toISOString()).toBe('2026-07-23T00:00:00.000Z');
    });
  });

  describe('exportCustomers', () => {
    it('builds a CSV download with a header and rows', async () => {
      customerModel.aggregate.mockResolvedValue([
        {
          customerCode: 'CU-ABC123',
          name: 'Ada Deo',
          phone: '698765294',
          whatsappPhone: '698765294',
          email: 'ada@example.com',
          language: 'fr',
          status: 'Active',
          homeOffice: 'DD 105 BONADALE',
          pickupAddress: 'Bonapriso',
          referralCode: 'REF456',
          totalOrders: 3,
          totalSpend: 18500,
          rewardPoints: 40,
          lastOrderAt: new Date('2026-08-01'),
          registeredAt: new Date('2026-07-01'),
          createdAt: '2026-07-01 10:00:00',
          updatedAt: '2026-08-01 10:00:00',
        },
      ]);

      const res = await service.exportCustomers({
        page: 1,
        size: 20,
        format: CustomerExportFormatEnum.CSV,
      } as ExportCustomerDto);

      expect(res.contentType).toBe('text/csv');
      expect(res.filename).toMatch(/^customers-export-\d{8}\.csv$/);
      const csv = res.buffer.toString('utf8');
      expect(csv).toContain('"Customer Code"');
      expect(csv).toContain('"CU-ABC123"');
      expect(csv).toContain('"Ada Deo"');
    });

    it('builds an Excel (xlsx) download', async () => {
      customerModel.aggregate.mockResolvedValue([]);

      const res = await service.exportCustomers({
        page: 1,
        size: 20,
        format: CustomerExportFormatEnum.EXCEL,
      } as ExportCustomerDto);

      expect(res.filename).toMatch(/^customers-export-\d{8}\.xlsx$/);
      expect(res.contentType).toBe(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      // xlsx is a zip archive — "PK" magic bytes.
      expect(res.buffer.subarray(0, 2).toString()).toBe('PK');
    });

    it('exports the full filtered set, never one page of it', async () => {
      customerModel.aggregate.mockResolvedValue([]);

      await service.exportCustomers({
        page: 3,
        size: 20,
        format: CustomerExportFormatEnum.CSV,
      } as ExportCustomerDto);

      const calls = customerModel.aggregate.mock.calls as unknown as [
        Record<string, unknown>[],
      ][];
      const stages = calls[0][0];
      expect(stages.some((stage) => '$skip' in stage)).toBe(false);
      expect(stages.some((stage) => '$limit' in stage)).toBe(false);
    });
  });

  /**
   * The three read endpoints build their pipeline from one method, so the
   * caller's CASL conditions must reach all three. A customer whose seeded
   * rule is `{ userId: '$self' }` must never see a peer through the table, the
   * cards or a downloaded file.
   */
  describe('customer scope', () => {
    type Stage = Record<string, Record<string, unknown>>;

    /** Become a customer reading their own records. */
    const asCustomer = () => {
      const userId = mockRequest.user.userId;
      mockRequest.user.ability = selfScopedAbility(userId);
      return new Types.ObjectId(userId);
    };

    /**
     * The `$and`-nested scope of a pipeline's leading $match, if any. CASL
     * hands back the caller's rules as an `$or` of their conditions — one
     * branch per matching rule.
     */
    const scopeOf = (stages: Stage[]) => {
      const first = stages[0].$match as { $and?: Record<string, unknown>[] };
      return first.$and?.[0] as
        | { $or: { userId: Types.ObjectId }[] }
        | undefined;
    };

    const scopedUserId = (stages: Stage[]) => scopeOf(stages)?.$or[0].userId;

    const pipelineOf = (call: number) =>
      (customerModel.aggregate.mock.calls as unknown as [Stage[]][])[call][0];

    it('narrows the list to the caller`s own record', async () => {
      const self = asCustomer();
      customerModel.aggregate.mockResolvedValue([]);

      await service.findAll({ page: 1, size: 20 } as FindCustomerDto);

      // Both passes — the count and the page — carry it, or the pager lies.
      for (const call of [0, 1]) {
        expect(scopeOf(pipelineOf(call))).toEqual({ $or: [{ userId: self }] });
      }
    });

    it('casts the condition id so an aggregate $match can match it', async () => {
      const self = asCustomer();
      customerModel.aggregate.mockResolvedValue([]);

      await service.findAll({ page: 1, size: 20 } as FindCustomerDto);

      // A 24-hex string would silently match nothing in an aggregation.
      const userId = scopedUserId(pipelineOf(0));
      expect(userId).toBeInstanceOf(Types.ObjectId);
      expect(userId?.toString()).toBe(self.toString());
    });

    it('keeps the scope beside the inactivity filter, not instead of it', async () => {
      const self = asCustomer();
      customerModel.aggregate.mockResolvedValue([]);

      await service.findAll({
        page: 1,
        size: 20,
        inactiveDays: 30,
      } as FindCustomerDto);

      // The inactivity filter owns `$or`; a spread would have dropped one of
      // the two and handed a scoped caller rows the scope was hiding.
      const match = pipelineOf(0)[0].$match as {
        $and?: Record<string, unknown>[];
        $or?: unknown[];
      };
      expect(match.$and?.[0]).toEqual({ $or: [{ userId: self }] });
      expect(match.$or).toHaveLength(2);
    });

    it('narrows every KPI pass, the facet and the active-customer join alike', async () => {
      const self = asCustomer();
      customerModel.aggregate
        .mockResolvedValueOnce([
          { total: [], newCustomers: [], atRisk: [], byStatus: [] },
        ])
        .mockResolvedValueOnce([]);

      await service.getCustomerKpis({} as FindCustomerDto);

      expect(scopeOf(pipelineOf(0))).toEqual({ $or: [{ userId: self }] });
      expect(scopeOf(pipelineOf(1))).toEqual({ $or: [{ userId: self }] });
    });

    it('narrows the export, so the file cannot carry a peer', async () => {
      const self = asCustomer();
      customerModel.aggregate.mockResolvedValue([]);

      await service.exportCustomers({
        page: 1,
        size: 20,
        format: CustomerExportFormatEnum.CSV,
      } as ExportCustomerDto);

      expect(scopeOf(pipelineOf(0))).toEqual({ $or: [{ userId: self }] });
    });

    it('leaves an unrestricted staff pipeline unscoped', async () => {
      customerModel.aggregate.mockResolvedValue([]);

      await service.findAll({ page: 1, size: 20 } as FindCustomerDto);

      // `manage all` yields no conditions — nothing to $and in.
      expect(scopeOf(pipelineOf(0))).toBeUndefined();
    });

    it('matches nothing at all for a caller denied Customer reads', async () => {
      const { can, build } = new AbilityBuilder(AppAbility);
      can('READ', 'Order');
      mockRequest.user.ability = build();
      customerModel.aggregate.mockResolvedValue([]);

      // The action check fires first; the pipeline is never even built.
      await expect(
        service.findAll({ page: 1, size: 20 } as FindCustomerDto),
      ).rejects.toThrow(BadRequestException);
      expect(customerModel.aggregate).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------- detail reads
  // Everything below is addressed by `customerCode`, never by the Mongo id.

  describe('detail reads', () => {
    // Mutable: several tests below turn on what the customer's own
    // `lastOrderAt` rollup says, which is the clock at-risk is measured on.
    const scopedCustomer: {
      _id: Types.ObjectId;
      userId: Types.ObjectId;
      customerCode: string;
      referralCode: string;
      lastOrderAt?: Date;
    } = {
      _id: new Types.ObjectId(),
      userId: new Types.ObjectId(),
      customerCode: 'CU-ABC123',
      referralCode: 'REF456',
    };

    /** The summary runs three aggregations at once, in a fixed order. */
    const summaryAggregations = (
      orders: Record<string, unknown> | null,
      methods: Record<string, unknown>[],
    ) => {
      orderModel.aggregate
        .mockResolvedValueOnce(orders ? [orders] : [])
        .mockResolvedValueOnce(methods);
      pickupRequestModel.aggregate.mockResolvedValue([
        { total: 18, lastPickupAt: new Date('2026-08-20T00:00:00.000Z') },
      ]);
    };

    beforeEach(() => {
      customerModel.findOne.mockResolvedValue(scopedCustomer);
    });

    it('findByCode: an unknown code is a 404, not an empty page', async () => {
      const chain = {
        populate: jest.fn().mockReturnThis(),
        then: (resolve: (value: null) => unknown) => resolve(null),
      };
      customerModel.findOne.mockReturnValue(chain);

      await expect(service.findByCode('CU-NOPE01')).rejects.toThrow(
        NotFoundException,
      );
      expect(customerModel.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ customerCode: 'CU-NOPE01' }),
      );
    });

    it('getSummary: totals the money and dates the last activity', async () => {
      const lastOrderAt = new Date('2026-08-21T00:00:00.000Z');
      const lastPaidAt = new Date('2026-08-22T00:00:00.000Z');
      scopedCustomer.lastOrderAt = lastOrderAt;
      summaryAggregations(
        {
          total: 25,
          cancelled: 1,
          withoutPickup: 6,
          paidInFull: 22,
          ordered: 385000,
          paid: 280000,
          outstanding: 35000,
          outstandingOrders: 2,
        },
        [
          {
            count: 14,
            amount: 168000,
            lastUsedAt: lastPaidAt,
            method: { paymentMethodName: 'MOMO' },
          },
          {
            count: 11,
            amount: 112000,
            lastUsedAt: new Date('2026-08-18T00:00:00.000Z'),
            method: { paymentMethodName: 'CASH' },
          },
        ],
      );

      const summary = await service.getSummary('CU-ABC123');

      expect(summary.orders).toEqual({
        total: 25,
        cancelled: 1,
        withoutPickup: 6,
        paidInFull: 22,
      });
      expect(summary.totalPickups).toBe(18);
      expect(summary.spend).toEqual({
        ordered: 385000,
        paid: 280000,
        outstanding: 35000,
        outstandingOrders: 2,
      });
      expect(summary.payments).toEqual({
        count: 25,
        total: 280000,
        average: 11200,
      });
      // Shares are rounded once here so two frontends cannot disagree.
      expect(summary.methods?.map((m) => m.share)).toEqual([60, 40]);
      // The most recent of order / pickup / payment — a payment here.
      expect(summary.activity.lastActivityAt).toEqual(lastPaidAt);
      // The customer's own maintained rollup, not a second clock of our own.
      expect(summary.activity.lastOrderAt).toEqual(lastOrderAt);
    });

    it('getSummary: paid comes from the orders, so a refund is not income', async () => {
      // The order rollup is already net (280,000 of 300,000 taken, 20,000
      // handed back). Summing the payment rows would have said 320,000.
      scopedCustomer.lastOrderAt = undefined;
      summaryAggregations(
        {
          total: 4,
          cancelled: 0,
          withoutPickup: 0,
          paidInFull: 3,
          ordered: 300000,
          paid: 280000,
          outstanding: 20000,
          outstandingOrders: 1,
        },
        [
          {
            count: 5,
            amount: 280000,
            lastUsedAt: new Date('2026-08-10T00:00:00.000Z'),
            method: { paymentMethodName: 'MOMO' },
          },
        ],
      );

      const summary = await service.getSummary('CU-ABC123');

      expect(summary.spend.paid).toBe(280000);
      expect(summary.payments.total).toBe(280000);
      // The count is records, refunds included — the ledger counts them too.
      expect(summary.payments.count).toBe(5);
      expect(summary.methods?.[0].share).toBe(100);
    });

    it('getSummary: at risk follows the overview rule, never for a lead', async () => {
      const stale = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      scopedCustomer.lastOrderAt = stale;
      summaryAggregations(null, []);
      pickupRequestModel.aggregate.mockResolvedValue([]);

      const risky = await service.getSummary('CU-ABC123');
      expect(risky.activity.atRisk).toBe(true);

      // Never ordered: a lead, not a risk.
      scopedCustomer.lastOrderAt = undefined;
      summaryAggregations(null, []);
      const lead = await service.getSummary('CU-ABC123');
      expect(lead.activity.atRisk).toBe(false);
      expect(lead.activity.daysSinceLastOrder).toBeUndefined();

      // Ordered yesterday: still with us.
      scopedCustomer.lastOrderAt = new Date(Date.now() - 86_400_000);
      summaryAggregations(null, []);
      const fresh = await service.getSummary('CU-ABC123');
      expect(fresh.activity.atRisk).toBe(false);
    });

    it('getSummary: a customer with no orders reads as zeros', async () => {
      scopedCustomer.lastOrderAt = undefined;
      summaryAggregations(null, []);
      pickupRequestModel.aggregate.mockResolvedValue([]);

      const summary = await service.getSummary('CU-ABC123');

      expect(summary.orders.total).toBe(0);
      expect(summary.spend.ordered).toBe(0);
      expect(summary.payments.average).toBe(0);
      expect(summary.methods).toEqual([]);
      expect(summary.activity.daysSinceLastOrder).toBeUndefined();
    });

    it('getSpendTrend: fills quiet months rather than skipping them', async () => {
      const now = new Date();
      const thisMonth = now.toISOString().slice(0, 7);
      orderModel.aggregate
        .mockResolvedValueOnce([{ _id: thisMonth, amount: 52000, orders: 2 }])
        .mockResolvedValueOnce([{ _id: thisMonth, amount: 24000, orders: 0 }]);

      const trend = await service.getSpendTrend('CU-ABC123', 6);

      expect(trend.months).toHaveLength(6);
      expect(trend.months.at(-1)).toEqual({
        month: thisMonth,
        ordered: 52000,
        paid: 24000,
        orders: 2,
      });
      // A month with no orders is a zero, not a gap in the chart.
      expect(trend.months[0].ordered).toBe(0);
      expect(trend.averageOrder).toBe(26000);
      // Nothing in the earlier three months, so there is nothing to compare
      // against — reporting that as a rise of infinity would mislead.
      expect(trend.changePercent).toBeUndefined();
    });
  });

  // ------------------------------------------------------- the update path
  // The real `updateProfile`, not just the validation in front of it: the
  // write splits across two collections, and getting the split wrong is the
  // failure a validation test cannot see.

  /** What a `findOneAndUpdate` was actually asked to set. */
  type WriteSet = Record<string, unknown>;

  describe('updateProfile', () => {
    const scoped = {
      _id: new Types.ObjectId(),
      userId: new Types.ObjectId(),
      customerCode: 'CU-ABC123',
      referralCode: 'REF456',
    };

    beforeEach(() => {
      customerModel.findOne.mockResolvedValue(scoped);
      customerModel.findOneAndUpdate.mockResolvedValue(scoped);
      userModel.findOneAndUpdate.mockResolvedValue({});
      userModel.exists.mockResolvedValue(null);
    });

    it('splits the write: identity fields on User, profile fields on Customer', async () => {
      const res = await service.updateProfile('CU-ABC123', {
        email: 'ada@example.com',
        whatsappPhone: '237698765294',
        preferredLanguage: PreferredLanguageEnum.FRENCH,
        pickupAddress: 'Rue Bonadale 12',
        notificationsOptIn: false,
      });

      const [userWhere, userSet] = userModel.findOneAndUpdate.mock
        .calls[0] as unknown as [{ _id: Types.ObjectId }, WriteSet];
      expect(userWhere).toEqual({ _id: scoped.userId });
      expect(userSet).toEqual({
        email: 'ada@example.com',
        whatsappPhone: '237698765294',
        preferredLanguage: PreferredLanguageEnum.FRENCH,
      });

      const [profileWhere, profileSet] = customerModel.findOneAndUpdate.mock
        .calls[0] as unknown as [{ _id: Types.ObjectId }, WriteSet];
      expect(profileWhere).toEqual({ _id: scoped._id });
      expect(profileSet).toEqual({
        pickupAddress: 'Rue Bonadale 12',
        notificationsOptIn: false,
      });

      expect(res).toBe('Profile updated successfully');
    });

    it('writes only the collection that actually changed', async () => {
      await service.updateProfile('CU-ABC123', { pickupAddress: 'Bonaberi' });

      expect(customerModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
      // Nothing on the identity moved, so the User is not touched — an empty
      // $set would still write an audit entry saying nothing changed.
      expect(userModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('carries the change reason into the audit context', async () => {
      await service.updateProfile('CU-ABC123', { notificationsOptIn: true });

      const [, , options] = customerModel.findOneAndUpdate.mock
        .calls[0] as unknown as [unknown, unknown, { context: unknown }];
      expect(options.context).toEqual(
        expect.objectContaining({ reason: mockRequest.data.reason }),
      );
    });

    it('goes through the caller\u2019s UPDATE scope, so a foreign code is a 404', async () => {
      customerModel.findOne.mockResolvedValue(null);

      await expect(
        service.updateProfile('CU-OTHER1', { pickupAddress: 'x' }),
      ).rejects.toThrow(NotFoundException);
      expect(userModel.findOneAndUpdate).not.toHaveBeenCalled();
      expect(customerModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('refuses an email already taken by someone else', async () => {
      userModel.exists.mockResolvedValue({ _id: new Types.ObjectId() });

      await expect(
        service.updateProfile('CU-ABC123', { email: 'taken@example.com' }),
      ).rejects.toThrow(ConflictException);
      // Rejected before either write, so a half-applied edit is impossible.
      expect(userModel.findOneAndUpdate).not.toHaveBeenCalled();
      expect(customerModel.findOneAndUpdate).not.toHaveBeenCalled();
    });
  });
});
