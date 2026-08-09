import { getConnectionToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Schema, SchemaTypes, Types, type SchemaDefinition } from 'mongoose';
import {
  HistoryLabelService,
  type HistoryEntryLike,
} from './history-label.service';

/**
 * A stand-in for a registered model: a REAL Mongoose schema — the service
 * reads its ref metadata straight off the schema, so a hand-rolled shape
 * would prove nothing — plus a chainable find().select().lean().
 */
const model = (
  definition: SchemaDefinition,
  rows: Record<string, unknown>[] = [],
) => {
  const find = jest.fn().mockReturnValue({
    select: () => ({ lean: () => Promise.resolve(rows) }),
  });
  return { schema: new Schema(definition), find };
};

const objectId = { type: SchemaTypes.ObjectId };

describe('HistoryLabelService', () => {
  const statusFrom = new Types.ObjectId();
  const statusTo = new Types.ObjectId();
  const userId = new Types.ObjectId();

  let service: HistoryLabelService;
  let models: Record<string, ReturnType<typeof model>>;

  const build = async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        HistoryLabelService,
        { provide: getConnectionToken(), useValue: { models } },
      ],
    }).compile();
    service = moduleRef.get(HistoryLabelService);
  };

  beforeEach(async () => {
    models = {
      Order: model({
        orderCode: String,
        totalAmount: Number,
        orderStatusId: { ...objectId, ref: 'OrderStatus' },
        createdBy: { ...objectId, ref: 'User' },
      }),
      OrderStatus: model({ orderStatusName: String, isActive: Boolean }, [
        { _id: statusFrom, orderStatusName: 'CONFIRMED' },
        { _id: statusTo, orderStatusName: 'RECEIVED' },
      ]),
      User: model({ firstName: String, lastName: String, phone: String }, [
        { _id: userId, firstName: 'Alice', lastName: 'Test' },
      ]),
    };
    await build();
  });

  const entry = (changes: Record<string, unknown>[]): HistoryEntryLike =>
    ({ changes }) as unknown as HistoryEntryLike;

  it('labels a foreign key from the schema ref, keeping the raw ids', async () => {
    const entries = [
      entry([{ field: 'orderStatusId', from: statusFrom, to: statusTo }]),
    ];

    const [labelled] = await service.labelChanges('Order', entries);

    expect(labelled.changes[0]).toEqual({
      field: 'orderStatusId',
      from: statusFrom,
      to: statusTo,
      fromLabel: 'CONFIRMED',
      toLabel: 'RECEIVED',
    });
  });

  it('names a person by first and last name', async () => {
    const entries = [entry([{ field: 'createdBy', from: null, to: userId }])];

    const [labelled] = await service.labelChanges('Order', entries);

    expect(labelled.changes[0].toLabel).toBe('Alice Test');
    expect(labelled.changes[0].fromLabel).toBeUndefined();
  });

  it('accepts a hex string as readily as an ObjectId', async () => {
    const entries = [
      entry([
        { field: 'orderStatusId', from: statusFrom.toString(), to: null },
      ]),
    ];

    const [labelled] = await service.labelChanges('Order', entries);

    expect(labelled.changes[0].fromLabel).toBe('CONFIRMED');
  });

  it('leaves plain values alone — only refs get labelled', async () => {
    const entries = [entry([{ field: 'totalAmount', from: 1000, to: 2000 }])];

    const [labelled] = await service.labelChanges('Order', entries);

    expect(labelled.changes[0]).toEqual({
      field: 'totalAmount',
      from: 1000,
      to: 2000,
    });
    expect(models.OrderStatus.find).not.toHaveBeenCalled();
  });

  it('queries each referenced collection once for the whole trail', async () => {
    const entries = [
      entry([{ field: 'orderStatusId', from: statusFrom, to: statusTo }]),
      entry([{ field: 'orderStatusId', from: statusTo, to: statusFrom }]),
      entry([{ field: 'orderStatusId', from: statusFrom, to: statusTo }]),
    ];

    await service.labelChanges('Order', entries);

    expect(models.OrderStatus.find).toHaveBeenCalledTimes(1);
    const [filter] = models.OrderStatus.find.mock.calls[0] as [
      { _id: { $in: Types.ObjectId[] } },
    ];
    // Deduplicated: two distinct ids across six references.
    expect(filter._id.$in).toHaveLength(2);
  });

  it('returns the trail unlabelled rather than failing when a row is gone', async () => {
    models.OrderStatus = model(
      { orderStatusName: String },
      [], // the status row was deleted
    );
    await build();
    const entries = [
      entry([{ field: 'orderStatusId', from: statusFrom, to: statusTo }]),
    ];

    const [labelled] = await service.labelChanges('Order', entries);

    expect(labelled.changes[0].fromLabel).toBeUndefined();
    expect(labelled.changes[0].from).toEqual(statusFrom);
  });

  it('survives an unregistered source model', async () => {
    const entries = [
      entry([{ field: 'orderStatusId', from: statusFrom, to: statusTo }]),
    ];

    await expect(
      service.labelChanges('NotAModel', entries),
    ).resolves.toHaveLength(1);
  });

  it('reads the schema metadata once and caches it', async () => {
    const entries = [
      entry([{ field: 'orderStatusId', from: statusFrom, to: statusTo }]),
    ];

    await service.labelChanges('Order', entries);
    await service.labelChanges('Order', entries);

    expect(models.OrderStatus.find).toHaveBeenCalledTimes(2); // per call
  });
});
