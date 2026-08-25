import { AbilityBuilder } from '@casl/ability';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { AppUtilService } from 'src/helper/service/app-util.service';
import { CodeGeneratorService } from 'src/helper/service/code-generator.service';
import { HistoryLabelService } from 'src/helper/service/history-label.service';
import { Currency } from 'src/schema/catalog/currency.schema';
import { Office } from 'src/schema/office/office.schema';
import {
  OrderPaymentStatusEnum,
  OrderStatusEnum,
} from 'src/schema/order/order.dto';
import { Order } from 'src/schema/order/order.schema';
import { PaymentMethod } from 'src/schema/payment/payment-method.schema';
import { PaymentType } from 'src/schema/payment/payment-type.schema';
import { PaymentTypeEnum } from 'src/schema/payment/payment.dto';
import { Payment } from 'src/schema/payment/payment.schema';
import { AppAbility } from 'src/helper/casl/casl.dto';
import { OrderEvents } from '../order/order.events';
import { PaymentEvents } from './payment.events';
import { PaymentExportFormatEnum } from './dto/export-payment.dto';
import { PaymentService } from './payment.service';

// Real unrestricted ability so scopeFilter's rulesToQuery yields {} here.
const manageAllAbility = () => {
  const { can, build } = new AbilityBuilder(AppAbility);
  can('manage', 'all');
  return build();
};

describe('PaymentService', () => {
  let service: PaymentService;
  let paymentModel: jest.Mock & {
    findOne: jest.Mock;
    aggregate: jest.Mock;
    findOneAndUpdate: jest.Mock;
  };
  let savedPayments: {
    $locals: Record<string, unknown>;
    save: jest.Mock;
    [field: string]: unknown;
  }[];
  let orderModel: {
    findOne: jest.Mock;
    findById: jest.Mock;
    findOneAndUpdate: jest.Mock;
  };
  let paymentTypeModel: { findById: jest.Mock; findOne: jest.Mock };
  let paymentMethodModel: { findById: jest.Mock };
  let currencyModel: { findOne: jest.Mock };
  let eventEmitter: { emit: jest.Mock };
  let historyLabelService: { labelChanges: jest.Mock };
  let headers: Record<string, string>;

  const validId = () => new Types.ObjectId().toString();
  const typeId = new Types.ObjectId();

  const buildOrder = (over: Record<string, unknown> = {}) => ({
    _id: new Types.ObjectId(),
    orderCode: 'OR-1',
    customerId: new Types.ObjectId(),
    amountPaid: 0,
    totalAmount: 1000,
    orderStatusId: { orderStatusName: OrderStatusEnum.CONFIRMED },
    ...over,
  });

  // createPaymentForOrder fetches via findOne({ _id, ...scope }).populate(...).
  const setOrder = (over: Record<string, unknown> = {}) =>
    orderModel.findOne.mockReturnValue({
      populate: jest.fn().mockResolvedValue(buildOrder(over)),
    });

  const dto = (over: Record<string, unknown> = {}) => ({
    paymentMethodId: validId(),
    paymentTypeId: validId(),
    amount: 500,
    ...over,
  });

  const lastOrderUpdate = () => {
    const calls = orderModel.findOneAndUpdate.mock.calls as unknown as Array<
      [
        unknown,
        {
          paymentStatus: OrderPaymentStatusEnum;
          flagged: boolean;
          amountPaid: number;
        },
      ]
    >;
    return calls[0][1];
  };

  beforeEach(async () => {
    headers = {};
    savedPayments = [];
    // Constructible: the service builds the payment with `new paymentModel()`
    // so it can set `$locals.changedBy` before saving — that is the only way
    // the history hook learns who took the money.
    paymentModel = Object.assign(
      jest.fn().mockImplementation((doc: Record<string, unknown>) => {
        const row = {
          ...doc,
          _id: new Types.ObjectId(),
          $locals: {} as Record<string, unknown>,
          save: jest.fn().mockImplementation(() => {
            savedPayments.push(row);
            return Promise.resolve(row);
          }),
        };
        return row;
      }),
      {
        findOne: jest.fn().mockResolvedValue(null),
        aggregate: jest.fn().mockResolvedValue([]),
        findOneAndUpdate: jest.fn().mockResolvedValue(null),
      },
    ) as unknown as typeof paymentModel;
    orderModel = {
      findOne: jest.fn(),
      findById: jest.fn(),
      findOneAndUpdate: jest.fn().mockResolvedValue({}),
    };
    paymentTypeModel = {
      findById: jest
        .fn()
        .mockResolvedValue({ paymentTypeName: PaymentTypeEnum.PAYMENT }),
      // The name→id resolution behind the `paymentType` filter.
      findOne: jest.fn().mockReturnValue({
        select: () => ({ lean: () => Promise.resolve({ _id: typeId }) }),
      }),
    };
    paymentMethodModel = {
      findById: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }),
    };
    currencyModel = {
      findOne: jest.fn().mockResolvedValue({ id: new Types.ObjectId() }),
    };
    eventEmitter = { emit: jest.fn() };
    historyLabelService = {
      labelChanges: jest.fn().mockResolvedValue(undefined),
    };

    const connection = {
      startSession: jest.fn().mockResolvedValue({
        withTransaction: async (fn: () => Promise<void>) => fn(),
        endSession: jest.fn(),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentService,
        { provide: AppUtilService, useValue: { parseSortParam: () => ({}) } },
        {
          provide: REQUEST,
          useValue: {
            headers,
            data: { platform: 'WEB', officeId: new Types.ObjectId() },
            user: {
              phone: '600',
              userId: validId(),
              ability: manageAllAbility(),
            },
          },
        },
        { provide: getModelToken(Payment.name), useValue: paymentModel },
        { provide: getModelToken(Order.name), useValue: orderModel },
        {
          provide: getModelToken(PaymentType.name),
          useValue: paymentTypeModel,
        },
        {
          provide: getModelToken(PaymentMethod.name),
          useValue: paymentMethodModel,
        },
        { provide: getModelToken(Currency.name), useValue: currencyModel },
        {
          provide: getModelToken(Office.name),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: CodeGeneratorService,
          useValue: {
            generatePaymentReference: jest.fn().mockResolvedValue('PY-TEST01'),
          },
        },
        { provide: getConnectionToken(), useValue: connection },
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: HistoryLabelService, useValue: historyLabelService },
      ],
    }).compile();

    service = await module.resolve<PaymentService>(PaymentService);
  });

  const pay = (over: Record<string, unknown> = {}) =>
    service.createPaymentForOrder({ orderId: validId() }, dto(over) as never);

  it('records a partial payment (PARTIAL, no order.paid)', async () => {
    setOrder({ amountPaid: 0, totalAmount: 1000 });

    await pay({ amount: 400 });

    expect(lastOrderUpdate().paymentStatus).toBe(
      OrderPaymentStatusEnum.PARTIAL,
    );
    expect(lastOrderUpdate().amountPaid).toBe(400);
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      PaymentEvents.recorded,
      expect.any(Object),
    );
    expect(eventEmitter.emit).not.toHaveBeenCalledWith(
      OrderEvents.paid,
      expect.anything(),
    );
  });

  it('settles the order (PAID) and emits order.paid', async () => {
    setOrder({ amountPaid: 600, totalAmount: 1000 });

    await pay({ amount: 400 });

    expect(lastOrderUpdate().paymentStatus).toBe(OrderPaymentStatusEnum.PAID);
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      OrderEvents.paid,
      expect.any(Object),
    );
  });

  it('attributes the payment so the history hook can audit it', async () => {
    setOrder();

    await pay({ amount: 400 });

    // Without $locals.changedBy the PaymentHistory row fails validation and
    // is swallowed, leaving a payment with no audit entry at all.
    expect(savedPayments).toHaveLength(1);
    expect(savedPayments[0].$locals.changedBy).toBeDefined();
    // Saved inside the caller's transaction, like the order update beside it.
    const [saveOptions] = savedPayments[0].save.mock.calls[0] as [
      { session?: unknown },
    ];
    expect(saveOptions.session).toBeDefined();
  });

  it('flags an overpayment as OVERPAID', async () => {
    setOrder({ amountPaid: 900, totalAmount: 1000 });

    await pay({ amount: 500 });

    expect(lastOrderUpdate().paymentStatus).toBe(
      OrderPaymentStatusEnum.OVERPAID,
    );
    expect(lastOrderUpdate().flagged).toBe(true);
  });

  it('flags a READY order that is not fully paid', async () => {
    setOrder({
      amountPaid: 0,
      totalAmount: 1000,
      orderStatusId: { orderStatusName: OrderStatusEnum.READY },
    });

    await pay({ amount: 400 });

    expect(lastOrderUpdate().flagged).toBe(true);
  });

  it('is idempotent: a replayed idempotency key does not double-count', async () => {
    headers['x-idempotency-key'] = 'key-1';
    setOrder();
    paymentModel.findOne.mockResolvedValue({ _id: new Types.ObjectId() });

    const res = await pay({ amount: 400 });

    expect(res).toBe('Payment already recorded');
    expect(savedPayments).toHaveLength(0);
    expect(orderModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects a payment on a DRAFT order', async () => {
    setOrder({ orderStatusId: { orderStatusName: OrderStatusEnum.DRAFT } });

    await expect(pay({ amount: 400 })).rejects.toThrow(BadRequestException);
  });

  it('rejects a refund on an order with no prior payments', async () => {
    setOrder({ amountPaid: 0 });
    paymentTypeModel.findById.mockResolvedValue({
      paymentTypeName: PaymentTypeEnum.REFUND,
    });

    await expect(pay({ amount: 400 })).rejects.toThrow(BadRequestException);
  });

  describe('findByReference', () => {
    const detail = (over: Record<string, unknown> = {}) => ({
      _id: new Types.ObjectId(),
      reference: 'PY-A4F92C',
      amount: 850,
      history: [],
      ...over,
    });

    it('resolves the reference and labels the trail', async () => {
      const history = [{ action: 'CREATE', changes: [] }];
      paymentModel.aggregate.mockResolvedValue([detail({ history })]);

      const result = await service.findByReference('PY-A4F92C');

      expect(result.reference).toBe('PY-A4F92C');
      // Foreign keys inside the trail are resolved to labels a reader
      // recognises, off the schema's own refs.
      expect(historyLabelService.labelChanges).toHaveBeenCalledWith(
        'Payment',
        history,
      );
    });

    it('matches on the reference and never returns the idempotency key', async () => {
      paymentModel.aggregate.mockResolvedValue([detail()]);

      await service.findByReference('PY-A4F92C');

      const [pipeline] = paymentModel.aggregate.mock.calls[0] as [
        Record<string, unknown>[],
      ];
      const [firstStage] = pipeline;
      expect(firstStage).toEqual({
        $match: expect.objectContaining({ reference: 'PY-A4F92C' }) as unknown,
      });
      // The trail is joined, and the stored snapshot is not among the fields
      // it projects.
      const historyStage = pipeline.find(
        (stage) =>
          '$lookup' in stage &&
          (stage.$lookup as { as: string }).as === 'history',
      );
      expect(JSON.stringify(historyStage)).not.toContain('snapshot');
      expect(pipeline[pipeline.length - 1]).toEqual({
        $project: { idempotencyKey: 0 },
      });
    });

    it('404s an unknown or out-of-scope reference rather than 403', async () => {
      paymentModel.aggregate.mockResolvedValue([]);

      await expect(service.findByReference('PY-NOPE00')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateByReference', () => {
    const REF = 'PY-A4F92C';
    const paymentDoc = {
      _id: new Types.ObjectId(),
      orderId: new Types.ObjectId(),
    };

    /** The detail read the method returns through once the write commits. */
    const stubDetail = () =>
      paymentModel.aggregate.mockResolvedValue([
        { reference: REF, history: [] },
      ]);

    beforeEach(() => {
      paymentModel.findOne.mockResolvedValue(paymentDoc);
      paymentModel.findOneAndUpdate.mockResolvedValue(paymentDoc);
      // recomputeOrderMoney reads the order through the session.
      orderModel.findById.mockReturnValue({
        populate: () => ({
          session: () =>
            Promise.resolve({
              _id: paymentDoc.orderId,
              totalAmount: 1700,
              orderStatusId: { orderStatusName: OrderStatusEnum.READY },
            }),
        }),
      });
      stubDetail();
    });

    /** Ability with everything short of the global wildcard. */
    const withoutManageAll = () => {
      const { can, build } = new AbilityBuilder(AppAbility);
      can('READ', 'Payment');
      can('CREATE', 'Payment');
      can('UPDATE', 'Payment');
      can('DELETE', 'Payment');
      can('manage', 'Payment');
      (
        service as unknown as {
          req: { user: { ability: ReturnType<typeof build> } };
        }
      ).req.user.ability = build();
    };

    it('refuses everything below manage/all, including manage Payment', async () => {
      withoutManageAll();

      await expect(
        service.updateByReference(REF, { amount: 900 }),
      ).rejects.toThrow(BadRequestException);
      expect(paymentModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('lets a global administrator correct the amount', async () => {
      await service.updateByReference(REF, { amount: 900 });

      const [filter, update] = paymentModel.findOneAndUpdate.mock.calls[0] as [
        unknown,
        Record<string, unknown>,
      ];
      expect(filter).toEqual({ _id: paymentDoc._id });
      expect(update).toEqual({ amount: 900 });
    });

    it('attributes the correction so the trail records who and why', async () => {
      await service.updateByReference(REF, { note: 'Counted twice' });

      const [, , options] = paymentModel.findOneAndUpdate.mock.calls[0] as [
        unknown,
        unknown,
        { context: { changedBy: Types.ObjectId } },
      ];
      expect(options.context.changedBy).toBeDefined();
    });

    it('re-derives the period when the paid date moves', async () => {
      // Two different reads go through findById here: the order's own month,
      // and the populated order the recompute works from.
      orderModel.findById.mockReturnValue({
        select: () => ({
          lean: () =>
            Promise.resolve({ receivedAt: new Date('2026-07-10T09:00:00Z') }),
        }),
        populate: () => ({
          session: () =>
            Promise.resolve({
              _id: paymentDoc.orderId,
              totalAmount: 1700,
              orderStatusId: { orderStatusName: OrderStatusEnum.READY },
            }),
        }),
      });

      await service.updateByReference(REF, { paidAt: '2026-08-02T10:00:00Z' });

      const [, update] = paymentModel.findOneAndUpdate.mock.calls[0] as [
        unknown,
        Record<string, unknown>,
      ];
      // August money against a July order is a carried-over balance.
      expect(update.paymentPeriod).toBe('PRIOR');
    });

    it('refuses an empty body rather than logging a change that never was', async () => {
      await expect(service.updateByReference(REF, {})).rejects.toThrow(
        BadRequestException,
      );
      expect(paymentModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('404s an unknown reference', async () => {
      paymentModel.findOne.mockResolvedValue(null);

      await expect(
        service.updateByReference('PY-NOPE00', { amount: 900 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('exportPayments', () => {
    const columns =
      'Reference,Order Code,Customer,Phone,Office,Payment Type,' +
      'Payment Method,Period,Amount,Currency,Paid At,Transaction Ref,' +
      'Received By,Note,Created At';

    const row = {
      reference: 'PY-A4F92C',
      orderCode: 'OR-B1C2D3',
      customerName: 'Alice Mbeki',
      customerPhone: '+237600000000',
      office: 'Douala 1',
      paymentType: 'PAYMENT',
      paymentMethod: 'Cash',
      paymentPeriod: 'CURRENT',
      amount: 5000,
      currency: 'XAF',
      paidAt: new Date('2026-08-08T15:04:00.000Z'),
      transactionRef: '',
      receivedBy: 'Jean Paul',
      note: 'Says "paid in full"',
      createdAt: '2026-08-08 15:04:00',
    };

    it('writes a CSV whose header matches the column order', async () => {
      paymentModel.aggregate.mockResolvedValue([row]);

      const result = await service.exportPayments({
        page: 1,
        size: 20,
        sort: '',
        format: PaymentExportFormatEnum.CSV,
      });

      const text = result.buffer.toString('utf8');
      expect(result.contentType).toBe('text/csv');
      expect(result.filename).toMatch(/^payments-export-\d{8}\.csv$/);
      // Leading BOM so Excel reads the accented names as UTF-8.
      expect(text.startsWith('\ufeff')).toBe(true);
      expect(text.replace('\ufeff', '').split('\r\n')[0]).toBe(
        columns
          .split(',')
          .map((header) => `"${header}"`)
          .join(','),
      );
    });

    it('escapes quotes and renders a date as YYYY-MM-DD', async () => {
      paymentModel.aggregate.mockResolvedValue([row]);

      const { buffer } = await service.exportPayments({
        page: 1,
        size: 20,
        sort: '',
        format: PaymentExportFormatEnum.CSV,
      });
      const [, line] = buffer.toString('utf8').split('\r\n');

      // RFC-4180: an embedded quote is doubled, not backslashed.
      expect(line).toContain('"Says ""paid in full"""');
      expect(line).toContain('"2026-08-08"');
    });

    it('refuses without the EXPORT action, which READ does not imply', async () => {
      const { can, build } = new AbilityBuilder(AppAbility);
      can('READ', 'Payment');
      (
        service as unknown as {
          req: { user: { ability: ReturnType<typeof build> } };
        }
      ).req.user.ability = build();

      await expect(
        service.exportPayments({
          page: 1,
          size: 20,
          sort: '',
          format: PaymentExportFormatEnum.CSV,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(paymentModel.aggregate).not.toHaveBeenCalled();
    });
  });

  describe('getPaymentKpis', () => {
    const kpis = () => service.getPaymentKpis({ page: 1, size: 20, sort: '' });

    /** The pipeline's leading $match — the filters both endpoints share. */
    const matchOf = (call: unknown) => {
      const [pipeline] = call as [Record<string, unknown>[]];
      const stage = pipeline[0] as {
        $match: { paidAt: { $gte: Date; $lte: Date } };
      };
      return stage.$match;
    };

    it('maps the facet onto the dashboard figures', async () => {
      paymentModel.aggregate.mockResolvedValue([
        {
          totals: [
            {
              // Already net of refunds: the pipeline signs each amount by its
              // payment type before summing.
              totalAmount: 140000,
              totalPayments: 12,
              totalCurrent: 118000,
              totalPrior: 22000,
            },
          ],
          byType: [
            { _id: 'PAYMENT', count: 10 },
            { _id: 'REFUND', count: 2 },
          ],
        },
      ]);

      const result = await kpis();

      // One pass: the totals and the breakdown read the same filtered set.
      expect(paymentModel.aggregate).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        totalAmount: 140000,
        totalPayments: 12,
        totalCurrent: 118000,
        totalPrior: 22000,
        byPaymentType: { payment: 10, refund: 2 },
      });
    });

    it('subtracts refunds from the totals but counts them as records', async () => {
      paymentModel.aggregate.mockResolvedValue([{ totals: [], byType: [] }]);
      await kpis();

      // Asserted on the pipeline itself: the sign lives in the aggregation,
      // which only a real server could evaluate.
      const [pipeline] = paymentModel.aggregate.mock.calls[0] as [
        Record<string, unknown>[],
      ];
      const facet = pipeline.find((stage) => '$facet' in stage) as {
        $facet: { totals: Record<string, unknown>[] };
      };
      const { $group } = facet.$facet.totals[0] as {
        $group: { totalAmount: unknown; totalPayments: unknown };
      };

      // A refund is negated before it is summed…
      const totalAmount = JSON.stringify($group.totalAmount);
      expect(totalAmount).toContain('REFUND');
      expect(totalAmount).toContain('$multiply');
      // …but still counts as one record.
      expect($group.totalPayments).toEqual({ $sum: 1 });
    });

    it('bounds an unfiltered window to the last 30 days', async () => {
      paymentModel.aggregate.mockResolvedValue([{ totals: [], byType: [] }]);
      await kpis();

      const { paidAt } = matchOf(paymentModel.aggregate.mock.calls[0]);
      const span = paidAt.$lte.getTime() - paidAt.$gte.getTime();
      expect(Math.round(span / 86_400_000)).toBe(30);
    });

    it('honours an explicit paidAt window', async () => {
      paymentModel.aggregate.mockResolvedValue([{ totals: [], byType: [] }]);
      await service.getPaymentKpis({
        page: 1,
        size: 20,
        sort: '',
        startDate: '2026-07-01',
        endDate: '2026-08-05',
      });

      const { paidAt } = matchOf(paymentModel.aggregate.mock.calls[0]);
      expect(paidAt.$gte).toEqual(new Date('2026-07-01'));
      expect(paidAt.$lte).toEqual(new Date('2026-08-05'));
    });

    it('keeps the breakdown across every type while the cards follow the tab', async () => {
      paymentModel.aggregate.mockResolvedValue([{ totals: [], byType: [] }]);
      await service.getPaymentKpis({
        page: 1,
        size: 20,
        sort: '',
        paymentType: PaymentTypeEnum.REFUND,
      });

      const [pipeline] = paymentModel.aggregate.mock.calls[0] as [
        Record<string, unknown>[],
      ];
      const facet = pipeline.find((stage) => '$facet' in stage) as {
        $facet: {
          totals: Record<string, unknown>[];
          byType: Record<string, unknown>[];
        };
      };

      // The type filter lives inside the totals branch only, so a selected tab
      // cannot zero the counts the tab strip itself renders.
      expect(facet.$facet.totals[0]).toHaveProperty('$match');
      expect(facet.$facet.byType).toHaveLength(1);
      expect(facet.$facet.byType[0]).toHaveProperty('$group');
      expect(
        pipeline.some(
          (stage) =>
            '$match' in stage &&
            'paymentTypeId' in (stage.$match as Record<string, unknown>),
        ),
      ).toBe(false);
    });

    it('answers zeros when nothing matched', async () => {
      // $group emits no row at all for an empty set.
      paymentModel.aggregate.mockResolvedValue([{ totals: [], byType: [] }]);

      expect(await kpis()).toEqual({
        totalAmount: 0,
        totalPayments: 0,
        totalCurrent: 0,
        totalPrior: 0,
        byPaymentType: { payment: 0, refund: 0 },
      });
    });

    it('keeps a payment with no type row out of the breakdown, not the totals', async () => {
      paymentModel.aggregate.mockResolvedValue([
        {
          totals: [
            {
              totalAmount: 5000,
              totalPayments: 2,
              totalCurrent: 5000,
              totalPrior: 0,
            },
          ],
          byType: [
            { _id: 'PAYMENT', count: 1 },
            { _id: null, count: 1 },
          ],
        },
      ]);

      const result = await kpis();

      expect(result.totalPayments).toBe(2);
      expect(result.byPaymentType).toEqual({ payment: 1, refund: 0 });
    });
  });
});
