import { AbilityBuilder } from '@casl/ability';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose, { Model, Types } from 'mongoose';
import { AppAbility } from '../src/helper/casl/casl.dto';
import { scopeFilter } from '../src/helper/casl/casl-scope';
import { Order, OrderSchema } from '../src/schema/order/order.schema';

/**
 * Integration proof of §3.7 against a REAL single-node replica-set Mongo:
 *  - a scoped by-id query denies cross-office access (the IDOR fix), verified
 *    against real ObjectId storage — which the unit mocks can't exercise;
 *  - multi-document transactions actually work on the replica set (the payment
 *    / confirm path throws on a standalone mongod).
 * Self-contained: spins up its own in-memory replica set, no Redis/AppModule.
 */
describe('CASL office scoping + transactions (replica-set Mongo)', () => {
  let replset: MongoMemoryReplSet;
  let orderModel: Model<Order>;

  const officeA = new Types.ObjectId();
  const officeB = new Types.ObjectId();
  let orderA: Order;
  let orderB: Order;

  const baseFields = (officeId: Types.ObjectId) => ({
    officeId,
    customerId: new Types.ObjectId(),
    currencyId: new Types.ObjectId(),
    orderStatusId: new Types.ObjectId(),
    estimatedDeliveryDate: new Date(),
  });

  const officeAbility = (officeId: Types.ObjectId) => {
    const { can, build } = new AbilityBuilder(AppAbility);
    can('UPDATE', 'Order', { officeId: officeId.toString() } as never);
    return build();
  };

  beforeAll(async () => {
    replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(replset.getUri(), { dbName: 'test' });
    orderModel = mongoose.model<Order>('order', OrderSchema);

    orderA = await orderModel.create({ ...baseFields(officeA), orderCode: 'OR-A' });
    orderB = await orderModel.create({ ...baseFields(officeB), orderCode: 'OR-B' });
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await replset.stop();
  });

  it('office-A staff CANNOT fetch office B order by id (IDOR closed)', async () => {
    const scope = scopeFilter(officeAbility(officeA), 'UPDATE', 'Order');
    const found = await orderModel.findOne({ _id: orderB._id, ...scope });
    expect(found).toBeNull();
  });

  it('office-A staff CAN fetch their own office order by id', async () => {
    const scope = scopeFilter(officeAbility(officeA), 'UPDATE', 'Order');
    const found = await orderModel.findOne({ _id: orderA._id, ...scope });
    expect(found?.orderCode).toBe('OR-A');
  });

  it('a global (unrestricted) user can fetch any office order', async () => {
    const { can, build } = new AbilityBuilder(AppAbility);
    can('manage', 'all');
    const scope = scopeFilter(build(), 'UPDATE', 'Order');
    const found = await orderModel.findOne({ _id: orderB._id, ...scope });
    expect(found?.orderCode).toBe('OR-B');
  });

  it('multi-document transactions work on the replica set', async () => {
    const session = await mongoose.startSession();
    await session.withTransaction(async () => {
      await orderModel.updateOne(
        { _id: orderA._id },
        { amountPaid: 500 },
        { session },
      );
    });
    await session.endSession();

    const updated = await orderModel.findById(orderA._id);
    expect(updated?.amountPaid).toBe(500);
  });
});
