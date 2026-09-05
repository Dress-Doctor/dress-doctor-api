import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { AppUtilService } from 'src/helper/service/app-util.service';
import { CodeGeneratorService } from 'src/helper/service/code-generator.service';
import { HistoryLabelService } from 'src/helper/service/history-label.service';
import { Role } from 'src/schema/admin/role.schema';
import { OfficeHistory } from 'src/schema/office/office-history.schema';
import { OfficeType } from 'src/schema/office/office-type.schema';
import { OfficeTypeEnum } from 'src/schema/office/office.dto';
import { OfficeUser } from 'src/schema/office/office-user.schema';
import { Office } from 'src/schema/office/office.schema';
import { OrderStatus } from 'src/schema/order/order-status.schema';
import { Order } from 'src/schema/order/order.schema';
import { Payment } from 'src/schema/payment/payment.schema';
import { PickupStatus } from 'src/schema/pickup/pickup-status.schema';
import { PickupRequest } from 'src/schema/pickup/pickup-request.schema';
import { Customer } from 'src/schema/user/customer.schema';
import { User } from 'src/schema/user/user.schema';
import { CreateOfficeDto } from './dto/create-office.dto';
import { OfficeExportFormatEnum } from './dto/export-office.dto';
import { OfficeIntervalEnum, OfficeMetricEnum } from './dto/office-detail.dto';
import { OfficeService } from './office.service';
import { ActivityService } from 'src/helper/service/activity.service';

type DocFactory = (data: Record<string, unknown>) => Record<string, unknown>;
const modelMock = (factory?: DocFactory) => {
  const ctor = jest
    .fn()
    .mockImplementation(factory ?? (() => ({}))) as jest.Mock & {
    aggregate: jest.Mock;
    exists: jest.Mock;
    find: jest.Mock;
    findById: jest.Mock;
    findOne: jest.Mock;
    findOneAndUpdate: jest.Mock;
    countDocuments: jest.Mock;
    deleteMany: jest.Mock;
    distinct: jest.Mock;
  };
  ctor.aggregate = jest.fn();
  ctor.exists = jest.fn();
  ctor.find = jest.fn();
  ctor.findById = jest.fn();
  ctor.findOne = jest.fn();
  ctor.findOneAndUpdate = jest.fn();
  ctor.countDocuments = jest.fn();
  ctor.deleteMany = jest.fn();
  ctor.distinct = jest.fn();
  return ctor;
};

describe('OfficeService', () => {
  let service: OfficeService;
  let officeModel: ReturnType<typeof modelMock>;
  let officeTypeModel: ReturnType<typeof modelMock>;
  let officeUserModel: ReturnType<typeof modelMock>;
  let roleModel: ReturnType<typeof modelMock>;
  let userModel: ReturnType<typeof modelMock>;
  let officeHistoryModel: ReturnType<typeof modelMock>;
  let customerModel: ReturnType<typeof modelMock>;
  let orderModel: ReturnType<typeof modelMock>;
  let orderStatusModel: ReturnType<typeof modelMock>;
  let pickupModel: ReturnType<typeof modelMock>;
  let pickupStatusModel: ReturnType<typeof modelMock>;
  let paymentModel: ReturnType<typeof modelMock>;
  let codeService: {
    signOfficeLink: jest.Mock;
    generateOfficeCode: jest.Mock;
  };

  const id = new Types.ObjectId().toString();
  const typeId = new Types.ObjectId();
  const doc = (data: Record<string, unknown>) => ({
    ...data,
    _id: new Types.ObjectId(),
    $locals: {} as Record<string, unknown>,
    save: jest.fn().mockResolvedValue(undefined),
  });

  const payload: CreateOfficeDto = {
    officeTypeId: id,
    officeName: 'Bonapriso Branch',
    slug: 'bonapriso',
    address: 'Rue 1',
    city: 'Douala',
    region: 'Littoral',
  };

  beforeEach(async () => {
    officeModel = modelMock(doc);
    officeTypeModel = modelMock();
    officeUserModel = modelMock();
    roleModel = modelMock();
    userModel = modelMock();
    officeHistoryModel = modelMock();
    customerModel = modelMock();
    orderModel = modelMock();
    orderStatusModel = modelMock();
    pickupModel = modelMock();
    pickupStatusModel = modelMock();
    paymentModel = modelMock();

    // Every dashboard read counts something; an empty office is the default,
    // and each test overrides only the figure it is about.
    for (const model of [
      customerModel,
      orderModel,
      pickupModel,
      paymentModel,
      officeUserModel,
      officeHistoryModel,
    ]) {
      model.aggregate.mockResolvedValue([]);
      model.countDocuments.mockResolvedValue(0);
      model.distinct.mockResolvedValue([]);
    }
    const emptyLean = { select: () => ({ lean: () => Promise.resolve([]) }) };
    orderStatusModel.find.mockReturnValue(emptyLean);
    pickupStatusModel.find.mockReturnValue(emptyLean);
    orderStatusModel.findOne.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve(null) }),
    });
    officeUserModel.find.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve([]) }),
    });

    officeTypeModel.findById.mockResolvedValue({ _id: id });
    officeTypeModel.findOne.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve({ _id: typeId }) }),
    });
    officeModel.aggregate.mockResolvedValue([]);
    officeModel.countDocuments.mockResolvedValue(0);
    officeModel.find.mockReturnValue({
      populate: () => ({
        sort: () => ({ skip: () => ({ limit: () => Promise.resolve([]) }) }),
      }),
    });
    officeModel.exists.mockResolvedValue(null);
    // Every by-code read resolves the office first; the branch itself is not
    // what those tests are about, so one stands in for all of them.
    officeModel.findOne.mockResolvedValue({
      _id: typeId,
      slug: 'bonapriso',
      officeCode: 'OF-JNYJ',
      officeName: 'Bonapriso Branch',
      get: () => new Date('2025-06-24T00:00:00.000Z'),
      populate: jest.fn().mockResolvedValue({ _id: typeId }),
    });
    officeUserModel.findOneAndUpdate.mockResolvedValue(undefined);
    officeUserModel.deleteMany.mockResolvedValue(undefined);
    roleModel.exists.mockResolvedValue({ _id: id });
    userModel.exists.mockResolvedValue({ _id: id });

    codeService = {
      signOfficeLink: jest.fn().mockReturnValue('sig123'),
      generateOfficeCode: jest.fn().mockResolvedValue('OF-XYZ'),
    };

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
        OfficeService,
        {
          provide: AppUtilService,
          useValue: {
            escapeRegex: (s: string) => s,
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
        { provide: CodeGeneratorService, useValue: codeService },
        {
          provide: REQUEST,
          useValue: {
            data: { platform: 'WEB' },
            user: { phone: '600', userId: id, ability: { can: () => true } },
          },
        },
        { provide: getModelToken(Office.name), useValue: officeModel },
        { provide: getModelToken(OfficeType.name), useValue: officeTypeModel },
        { provide: getModelToken(OfficeUser.name), useValue: officeUserModel },
        { provide: getModelToken(Role.name), useValue: roleModel },
        { provide: getModelToken(User.name), useValue: userModel },
        {
          provide: getModelToken(OfficeHistory.name),
          useValue: officeHistoryModel,
        },
        { provide: getModelToken(Customer.name), useValue: customerModel },
        { provide: getModelToken(Order.name), useValue: orderModel },
        {
          provide: getModelToken(OrderStatus.name),
          useValue: orderStatusModel,
        },
        { provide: getModelToken(PickupRequest.name), useValue: pickupModel },
        {
          provide: getModelToken(PickupStatus.name),
          useValue: pickupStatusModel,
        },
        { provide: getModelToken(Payment.name), useValue: paymentModel },
        {
          provide: HistoryLabelService,
          useValue: { labelChanges: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = await module.resolve<OfficeService>(OfficeService);
  });

  describe('create', () => {
    it('generates officeCode + signedLink and saves', async () => {
      await service.create(payload);

      expect(officeModel).toHaveBeenCalledTimes(1);
      const calls = officeModel.mock.calls as unknown as Array<
        [{ officeCode: string; signedLink: string }]
      >;
      expect(calls[0][0].officeCode).toBe('OF-XYZ');
      expect(calls[0][0].signedLink).toContain('sig123');
    });

    it('rejects an invalid office type', async () => {
      officeTypeModel.findById.mockResolvedValue(null);
      await expect(service.create(payload)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects a duplicate name/slug', async () => {
      officeModel.exists.mockResolvedValue({ _id: id });
      await expect(service.create(payload)).rejects.toThrow(ConflictException);
    });
  });

  describe('findAll', () => {
    const query = { page: 1, size: 20, sort: '' };
    // The filter object handed to countDocuments is the same one find() gets.
    const whereOf = () => {
      const calls = officeModel.countDocuments.mock.calls as unknown as Array<
        [Record<string, unknown>]
      >;
      return calls[0][0];
    };

    it('resolves officeTypeName to the office type id', async () => {
      await service.findAll({
        ...query,
        officeTypeName: OfficeTypeEnum.OFFICE,
      });

      expect(officeTypeModel.findOne).toHaveBeenCalledWith({
        officeTypeName: 'OFFICE',
      });
      expect(whereOf().officeTypeId).toEqual(typeId);
    });

    it('matches nothing when the office type name is unknown', async () => {
      officeTypeModel.findOne.mockReturnValue({
        select: () => ({ lean: () => Promise.resolve(null) }),
      });

      await service.findAll({
        ...query,
        officeTypeName: OfficeTypeEnum.FACTORY,
      });

      expect(whereOf().officeTypeId).not.toEqual(typeId);
      expect(whereOf().officeTypeId).toBeInstanceOf(Types.ObjectId);
    });

    it('searches every text field', async () => {
      await service.findAll({ ...query, q: 'bonapriso' });

      const keys = (whereOf().$or as Record<string, unknown>[]).flatMap(
        Object.keys,
      );
      expect(keys).toEqual([
        'officeName',
        'address',
        'city',
        'region',
        'officeCode',
        'slug',
      ]);
    });

    it('builds a createdAt range, with endDate covering the whole day', async () => {
      await service.findAll({
        ...query,
        startDate: '2026-07-01',
        endDate: '2026-08-05',
      });

      const range = whereOf().createdAt as { $gte: Date; $lte: Date };
      expect(range.$gte.toISOString()).toBe('2026-07-01T00:00:00.000Z');
      expect(range.$lte.toISOString()).toBe('2026-08-05T23:59:59.999Z');
    });

    it('leaves createdAt alone when neither bound is given', async () => {
      await service.findAll(query);
      expect(whereOf().createdAt).toBeUndefined();
    });
  });

  describe('getOfficeKpis', () => {
    const query = { page: 1, size: 20, sort: '' };

    beforeEach(() => {
      officeModel.aggregate.mockResolvedValue([
        { _id: true, n: 12 },
        { _id: false, n: 2 },
      ]);
      officeModel.countDocuments.mockResolvedValue(14);
    });

    it('counts the offices and breaks them down by status', async () => {
      const kpis = await service.getOfficeKpis(query);

      expect(kpis).toEqual({
        totalOffices: 14,
        totalActive: 12,
        totalInactive: 2,
        byStatusCount: { all: 14, active: 12, inactive: 2 },
      });
    });

    it('keeps isActive out of the byStatusCount pipeline', async () => {
      officeModel.countDocuments.mockResolvedValue(12);

      const kpis = await service.getOfficeKpis({ ...query, isActive: true });

      // The status filter narrows the headline figure...
      expect(officeModel.countDocuments).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: true }),
      );
      // ...but not the breakdown, so a tab strip keeps both counts.
      const calls = officeModel.aggregate.mock.calls as unknown as Array<
        [[{ $match: Record<string, unknown> }]]
      >;
      expect(calls[0][0][0].$match).not.toHaveProperty('isActive');
      expect(kpis.totalOffices).toBe(12);
      expect(kpis.byStatusCount).toEqual({ all: 14, active: 12, inactive: 2 });
    });

    it('reports zeros when nothing matches', async () => {
      officeModel.aggregate.mockResolvedValue([]);
      officeModel.countDocuments.mockResolvedValue(0);

      expect(await service.getOfficeKpis(query)).toEqual({
        totalOffices: 0,
        totalActive: 0,
        totalInactive: 0,
        byStatusCount: { all: 0, active: 0, inactive: 0 },
      });
    });
  });

  describe('exportOffices', () => {
    const columns =
      'Office Code,Office Name,Office Type,Slug,Address,City,Region,Status,' +
      'Created At,Updated At';

    const row = {
      officeCode: 'OF-XYZ',
      officeName: 'Bonapriso "Main" Branch',
      officeType: 'OFFICE',
      slug: 'bonapriso',
      address: 'Rue 1',
      city: 'Douala',
      region: 'Littoral',
      status: 'Active',
      createdAt: '2026-08-08 15:04:00',
      updatedAt: '2026-08-09 09:00:00',
    };

    const exportCsv = () =>
      service.exportOffices({
        page: 1,
        size: 20,
        sort: '',
        format: OfficeExportFormatEnum.CSV,
      });

    it('writes a CSV whose header matches the column order', async () => {
      officeModel.aggregate.mockResolvedValue([row]);

      const result = await exportCsv();
      const text = result.buffer.toString('utf8');

      expect(result.contentType).toBe('text/csv');
      expect(result.filename).toMatch(/^offices-export-\d{8}\.csv$/);
      // Leading BOM so Excel reads accented names as UTF-8.
      expect(text.startsWith('\ufeff')).toBe(true);
      expect(text.replace('\ufeff', '').split('\r\n')[0]).toBe(
        columns
          .split(',')
          .map((header) => `"${header}"`)
          .join(','),
      );
    });

    it('escapes embedded quotes and leaves out the signed link', async () => {
      officeModel.aggregate.mockResolvedValue([row]);

      const [, line] = (await exportCsv()).buffer
        .toString('utf8')
        .split('\r\n');

      // RFC-4180: an embedded quote is doubled, not backslashed.
      expect(line).toContain('"Bonapriso ""Main"" Branch"');
      expect(columns).not.toContain('Signed');
      expect(columns).not.toContain('QR');
    });

    it('builds an xlsx for the excel format', async () => {
      officeModel.aggregate.mockResolvedValue([row]);

      const result = await service.exportOffices({
        page: 1,
        size: 20,
        sort: '',
        format: OfficeExportFormatEnum.EXCEL,
      });

      expect(result.filename).toMatch(/^offices-export-\d{8}\.xlsx$/);
      expect(result.contentType).toContain('spreadsheetml.sheet');
      expect(result.buffer.length).toBeGreaterThan(0);
    });

    it('refuses without the EXPORT action, which READ does not imply', async () => {
      (
        service as unknown as {
          req: { user: { ability: { can: (action: string) => boolean } } };
        }
      ).req.user.ability = { can: (action: string) => action === 'READ' };

      await expect(exportCsv()).rejects.toThrow(BadRequestException);
      expect(officeModel.aggregate).not.toHaveBeenCalled();
    });
  });

  describe('resolving an office by code', () => {
    it('looks the office up by officeCode, upper-cased', async () => {
      await service.findOne('of-jnyj');

      const calls = officeModel.findOne.mock.calls as unknown as Array<
        [{ officeCode: string }]
      >;
      expect(calls[0][0]).toEqual({ officeCode: 'OF-JNYJ' });
    });

    it('still accepts a Mongo id, so old :id callers keep working', async () => {
      await service.findOne(id);

      const calls = officeModel.findOne.mock.calls as unknown as Array<
        [{ $or: Record<string, unknown>[] }]
      >;
      expect(calls[0][0].$or).toHaveLength(2);
    });

    it('404s on an unknown code rather than returning nothing', async () => {
      officeModel.findOne.mockResolvedValue(null);

      await expect(service.findOne('OF-NOPE')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('assignUser', () => {
    it('upserts an OfficeUser row so a re-assignment revives the old one', async () => {
      await service.assignUser('OF-JNYJ', { userId: id, roleId: id });

      expect(officeUserModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
      const calls = officeUserModel.findOneAndUpdate.mock
        .calls as unknown as Array<
        [unknown, { isActive: boolean }, { upsert: boolean }]
      >;
      expect(calls[0][1].isActive).toBe(true);
      expect(calls[0][2].upsert).toBe(true);
    });

    it('rejects an invalid role', async () => {
      roleModel.exists.mockResolvedValue(null);

      await expect(
        service.assignUser('OF-JNYJ', { userId: id, roleId: id }),
      ).rejects.toThrow('Invalid role id');
    });
  });

  describe('revokeUser', () => {
    it('flags the assignment inactive instead of deleting it', async () => {
      officeUserModel.findOneAndUpdate.mockResolvedValue({ _id: id });

      await service.revokeUser('OF-JNYJ', id);

      expect(officeUserModel.deleteMany).not.toHaveBeenCalled();
      const calls = officeUserModel.findOneAndUpdate.mock
        .calls as unknown as Array<[unknown, { isActive: boolean }]>;
      expect(calls[0][1]).toEqual({ isActive: false });
    });

    it('404s when the user was never assigned here', async () => {
      officeUserModel.findOneAndUpdate.mockResolvedValue(null);

      await expect(service.revokeUser('OF-JNYJ', id)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getOfficeSummary', () => {
    it('counts orders in the window and staff without it', async () => {
      orderModel.countDocuments.mockResolvedValue(12);
      officeUserModel.aggregate.mockResolvedValue([
        { _id: true, n: 7 },
        { _id: false, n: 1 },
      ]);

      const result = await service.getOfficeSummary('OF-JNYJ', {
        startDate: '2026-08-01',
        endDate: '2026-08-27',
      });

      expect(result.staffTotal).toBe(8);
      expect(result.staffActive).toBe(7);

      // The staff count must not carry the date window: it describes the
      // office as it stands today.
      const staffMatch = (
        officeUserModel.aggregate.mock.calls as unknown as Array<
          [Array<{ $match?: Record<string, unknown> }>]
        >
      )[0][0][0].$match;
      expect(staffMatch).not.toHaveProperty('createdAt');

      const orderWhere = (
        orderModel.countDocuments.mock.calls as unknown as Array<
          [{ createdAt?: { $gte: Date; $lte: Date } }]
        >
      )[0][0];
      // endDate covers the whole day, or "up to the 27th" would stop at
      // midnight and lose a day of trade.
      expect(orderWhere.createdAt?.$lte.toISOString()).toBe(
        '2026-08-27T23:59:59.999Z',
      );
    });
  });

  describe('getPerformance', () => {
    /** Answers the bucket pipeline with `rows` and the total pipeline with a sum. */
    const seriesIs = (rows: { _id: string; n: number }[]) =>
      orderModel.aggregate.mockImplementation(
        (stages: Record<string, unknown>[]) =>
          // The bucket pipeline groups and sorts; the total sums to one row.
          stages.some((stage) => '$sort' in stage)
            ? Promise.resolve(rows)
            : Promise.resolve([
                { n: rows.reduce((sum, row) => sum + row.n, 0) },
              ]),
      );

    it('fills days with no activity with zero rather than dropping them', async () => {
      seriesIs([{ _id: '2026-08-03', n: 4 }]);

      const result = await service.getPerformance('OF-JNYJ', {
        metric: OfficeMetricEnum.ORDERS,
        interval: OfficeIntervalEnum.DAILY,
        startDate: '2026-08-01',
        endDate: '2026-08-04',
      });

      expect(result.points).toEqual([
        { date: '2026-08-01', value: 0 },
        { date: '2026-08-02', value: 0 },
        { date: '2026-08-03', value: 4 },
        { date: '2026-08-04', value: 0 },
      ]);
      expect(result.periodTotal).toBe(4);
    });

    it('sums the days of a week into one bucket dated its Monday', async () => {
      // 2026-08-01 is a Saturday, so it belongs to the week of the 27th July.
      seriesIs([
        { _id: '2026-08-01', n: 2 },
        { _id: '2026-08-03', n: 5 },
        { _id: '2026-08-04', n: 1 },
      ]);

      const result = await service.getPerformance('OF-JNYJ', {
        metric: OfficeMetricEnum.ORDERS,
        interval: OfficeIntervalEnum.WEEKLY,
        startDate: '2026-08-01',
        endDate: '2026-08-04',
      });

      expect(result.points).toEqual([
        { date: '2026-07-27', value: 2 },
        { date: '2026-08-03', value: 6 },
      ]);
    });

    it('averages over the buckets on screen, not over the days behind them', async () => {
      seriesIs([
        { _id: '2026-07-15', n: 4 },
        { _id: '2026-08-03', n: 6 },
      ]);

      const result = await service.getPerformance('OF-JNYJ', {
        metric: OfficeMetricEnum.ORDERS,
        interval: OfficeIntervalEnum.MONTHLY,
        startDate: '2026-07-01',
        endDate: '2026-08-31',
      });

      expect(result.points).toEqual([
        { date: '2026-07-01', value: 4 },
        { date: '2026-08-01', value: 6 },
      ]);
      expect(result.buckets).toBe(2);
      expect(result.averagePerBucket).toBe(5);
    });

    it('reports no delta when there is no previous window to compare with', async () => {
      const result = await service.getPerformance('OF-JNYJ', {
        metric: OfficeMetricEnum.ORDERS,
        interval: OfficeIntervalEnum.DAILY,
      });

      expect(result.deltaPercent).toBeNull();
    });
  });

  describe('getInsights', () => {
    it('excludes cancelled orders from the completion rate', async () => {
      // 10 orders, 2 cancelled, 6 delivered — 6/8, not 6/10.
      orderModel.countDocuments.mockImplementation(
        (where: { orderStatusId?: unknown }) =>
          Promise.resolve(where.orderStatusId ? 6 : 10),
      );
      orderStatusModel.findOne.mockImplementation(
        (where: { orderStatusName: string }) => ({
          select: () => ({
            lean: () =>
              Promise.resolve(
                where.orderStatusName === 'DELIVERED' ? { _id: typeId } : null,
              ),
          }),
        }),
      );

      const result = await service.getInsights('OF-JNYJ', {});

      expect(result.completionRate).toBe(60);
    });
  });
});
