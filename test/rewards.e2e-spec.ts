/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-require-imports */
import {
  INestApplication,
  RequestMethod,
  VersioningType,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Types } from 'mongoose';
import request from 'supertest';
import { HTTPExceptionFilter } from '../src/helper/exception-filters/http.exception-filter';
import { HTTPResponseInterceptor } from '../src/helper/interceptor/http.interceptor';
import { AppValidationPipe } from '../src/helper/pipe/app-validation.pipe';
import { redisTestEnv } from './redis-test-env';

/**
 * Rewards engine over the REAL loop (§2.1 / §3): an order paid over HTTP emits
 * order.paid → listener enqueues on the real Redis-backed reward-accrual
 * queue → the processor credits the ledger + rollups in a replica-set-Mongo
 * transaction. Then proves idempotency on replay and transactional redemption
 * over HTTP.
 */
describe('Rewards accrual through the queue (e2e)', () => {
  jest.setTimeout(120000);

  let app: INestApplication;
  let rs: MongoMemoryReplSet;
  const apiHeaders = {
    'x-api-key': 'e2e-key',
    'x-api-secret': 'e2e-secret',
    // Every mutation must say why it is being made; these suites are not
    // testing that rule, so they answer it once here.
    'x-change-reason': 'automated end-to-end test',
  };
  let adminToken: string;
  let customerUserId: Types.ObjectId;

  const model = (name: string) => app.get(getModelToken(name));
  const auth = (r: request.Test) =>
    r.set(apiHeaders).set('Authorization', `Bearer ${adminToken}`);
  const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString();

  const waitFor = async (
    cond: () => Promise<boolean>,
    ms = 30000,
    step = 250,
  ) => {
    const until = Date.now() + ms;
    while (Date.now() < until) {
      if (await cond()) return;
      await new Promise((r) => setTimeout(r, step));
    }
    throw new Error('waitFor timed out');
  };

  beforeAll(async () => {
    rs = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    Object.assign(process.env, {
      DATABASE_URL: rs.getUri('rewards-e2e'),
      ...redisTestEnv('rewards'),
      JWT_SECRET: 'e2e-secret-min-16-chars',
      JWT_ACCESS_TTL: '15m',
      SALT: bcrypt.genSaltSync(10),
      ADMIN_PASSWORD: 'Admin@12345',
      DD_API_URL: 'http://localhost:3000',
      DD_WEB_URL: 'http://localhost:5173',
      DD_OFFICE_LINK_SECRET: 'e2e-office-secret',
      SMTP_HOST: 'localhost',
      SMTP_PORT: '587',
      SMTP_USER: 'x',
      SMTP_PASS: 'x',
      MAIL_FROM: 'e2e@dressdoctor.io',
    });

    const { AppModule } = require('../src/app.module');
    const {
      QueueProcessorModule,
    } = require('../src/queue/queue-processor.module');
    const moduleRef = await Test.createTestingModule({
      // AppModule is the API half only — processors run in the worker
      // (src/worker.module.ts). A spec that exercises the real queue loop has
      // to stand both halves up, the way api + worker do in deployment.
      imports: [AppModule, QueueProcessorModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', {
      exclude: [
        { path: 'o/*path', method: RequestMethod.GET },
        { path: 'health', method: RequestMethod.GET },
        { path: 'ready', method: RequestMethod.GET },
      ],
    });
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalFilters(new HTTPExceptionFilter());
    app.useGlobalInterceptors(new HTTPResponseInterceptor());
    app.useGlobalPipes(AppValidationPipe);
    await app.init();

    // Wait for the fire-and-forget seeder to settle.
    const apiClientModel = model('ApiClient');
    for (let i = 0; i < 120; i++) {
      if (await apiClientModel.findOne({ name: 'System' })) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    await apiClientModel.create({
      name: 'e2e',
      key: 'e2e-key',
      secretHash: await bcrypt.hash('e2e-secret', 10),
      scope: ['WEB'],
      isActive: true,
    });

    // Admin (Manager: manage all) for staff calls.
    const adminType = await model('UserType').findOne({
      userTypeName: 'ADMIN',
    });
    const manager = await model('Role').findOne({ roleName: 'Manager' });
    const admin = await model('User').create({
      firstName: 'E2E',
      lastName: 'Admin',
      phone: '690000010',
      whatsappPhone: '690000010',
      userTypeId: adminType?._id ?? new Types.ObjectId(),
    });
    if (manager) {
      await model('UserRole').create({
        userId: admin._id,
        roleId: manager._id,
      });
    }
    adminToken = await app.get(JwtService).signAsync({
      sub: admin._id.toString(),
      phone: admin.phone,
      userType: 'ADMIN',
    });

    // Customer User + 1:1 profile (rollups start at 0).
    const customerType = await model('UserType').findOne({
      userTypeName: 'CUSTOMER',
    });
    const customer = await model('User').create({
      firstName: 'Points',
      lastName: 'Customer',
      phone: '611111100',
      whatsappPhone: '237611111100',
      userTypeId: customerType._id,
    });
    customerUserId = customer._id;
    await model('Customer').create({
      userId: customer._id,
      customerCode: 'CU-E2E001',
      referralCode: 'RF-E2E001',
    });
  });

  afterAll(async () => {
    await app?.close();
    await rs?.stop();
  });

  /** Create a PER_KG order over HTTP and walk it to CONFIRMED. */
  const createConfirmedOrder = async (weightKg: number): Promise<string> => {
    const currencyId = (
      await model('Currency').findOne({ isoCode: 'XAF' })
    )._id.toString();
    const itemId = (await model('Item').findOne({}))._id.toString();
    const serviceTypeId = (
      await model('ServiceType').findOne({})
    )._id.toString();

    await auth(request(app.getHttpServer()).post('/api/v1/orders'))
      .send({
        customerId: customerUserId.toString(),
        currencyId,
        pricingModel: 'PER_KG',
        totalWeightKg: weightKg,
        estimatedDeliveryDate: tomorrow(),
      })
      .expect(201);

    const order = await model('Order')
      .findOne({ customerId: customerUserId })
      .sort({ createdAt: -1 });
    const orderId = order._id.toString();

    await auth(
      request(app.getHttpServer()).post(`/api/v1/orders/${orderId}/items`),
    )
      .send({ itemId, serviceTypeId, quantity: 1 })
      .expect(201);
    await auth(
      request(app.getHttpServer()).post(`/api/v1/orders/${orderId}/confirm`),
    ).expect(200);

    return orderId;
  };

  const payInFull = async (orderId: string, amount: number) => {
    const methodId = (await model('PaymentMethod').findOne({}))._id.toString();
    const typeId = (
      await model('PaymentType').findOne({ paymentTypeName: 'PAYMENT' })
    )._id.toString();
    await auth(
      request(app.getHttpServer()).post(`/api/v1/orders/${orderId}/payments`),
    )
      .send({ paymentMethodId: methodId, paymentTypeId: typeId, amount })
      .expect(201);
  };

  let firstOrderId: string;

  it('order.paid → queue → EARN ledger row + rollups + cached balance', async () => {
    firstOrderId = await createConfirmedOrder(5); // 5kg × 1000 = 5000 XAF

    await payInFull(firstOrderId, 5000);

    // The seeded ACCRUAL rule (1 pt / 100 XAF) credits 50 points via the queue.
    await waitFor(async () => {
      const c = await model('Customer').findOne({ userId: customerUserId });
      return c?.rewardPoints === 50;
    });

    const ledger = await model('RewardLedger').find({
      customerId: customerUserId,
    });
    expect(ledger).toHaveLength(1);
    expect(ledger[0].type).toBe('EARN');
    expect(ledger[0].points).toBe(50);
    expect(ledger[0].orderId.toString()).toBe(firstOrderId);

    const customer = await model('Customer').findOne({
      userId: customerUserId,
    });
    expect(customer.totalOrders).toBe(1);
    expect(customer.totalSpend).toBe(5000);

    // Tier recomputed → Standard (threshold 0).
    const standard = await model('RewardTier').findOne({
      tierName: 'Standard',
    });
    expect(customer.rewardTierId?.toString()).toBe(standard._id.toString());
  });

  it('a replayed order.paid does NOT double-credit (idempotent per order)', async () => {
    const emitter = app.get(EventEmitter2);
    emitter.emit('order.paid', {
      orderId: new Types.ObjectId(firstOrderId),
      customerId: customerUserId,
    });

    // Give the (deduped) job time to have run if it were going to.
    await new Promise((r) => setTimeout(r, 3000));

    const ledger = await model('RewardLedger').find({
      customerId: customerUserId,
      type: 'EARN',
    });
    expect(ledger).toHaveLength(1);
    const customer = await model('Customer').findOne({
      userId: customerUserId,
    });
    expect(customer.rewardPoints).toBe(50);
    expect(customer.totalOrders).toBe(1);
  });

  it('POST /rewards/redeem applies a transactional discount on a draft order', async () => {
    // New draft order: 3kg → 3000 XAF.
    const currencyId = (
      await model('Currency').findOne({ isoCode: 'XAF' })
    )._id.toString();
    await auth(request(app.getHttpServer()).post('/api/v1/orders'))
      .send({
        customerId: customerUserId.toString(),
        currencyId,
        pricingModel: 'PER_KG',
        totalWeightKg: 3,
        estimatedDeliveryDate: tomorrow(),
      })
      .expect(201);
    const draft = await model('Order')
      .findOne({ customerId: customerUserId })
      .sort({ createdAt: -1 });

    const res = await auth(
      request(app.getHttpServer()).post('/api/v1/rewards/redeem'),
    )
      .send({
        customerId: customerUserId.toString(),
        points: 30,
        orderId: draft._id.toString(),
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.discount).toBe(30); // 30 pts × 1 XAF
    expect(res.body.data.balance).toBe(20);

    const updated = await model('Order').findById(draft._id);
    expect(updated.rewardDiscount).toBe(30);
    expect(updated.redeemedPoints).toBe(30);
    expect(updated.totalAmount).toBe(2970);

    const customer = await model('Customer').findOne({
      userId: customerUserId,
    });
    expect(customer.rewardPoints).toBe(20);

    // Second redemption on the same order is blocked (one per order).
    const dup = await auth(
      request(app.getHttpServer()).post('/api/v1/rewards/redeem'),
    )
      .send({
        customerId: customerUserId.toString(),
        points: 10,
        orderId: draft._id.toString(),
      })
      .expect(400);
    expect(dup.body.error?.code).toBe('ALREADY_REDEEMED');
  });

  it('overdrawing the balance is rejected (INSUFFICIENT_POINTS)', async () => {
    // Same draft: the in-txn balance check fires before the one-per-order
    // index, so overdraw is the error surfaced.
    const draft = await model('Order')
      .findOne({ customerId: customerUserId })
      .sort({ createdAt: -1 });

    const res = await auth(
      request(app.getHttpServer()).post('/api/v1/rewards/redeem'),
    )
      .send({
        customerId: customerUserId.toString(),
        points: 999,
        orderId: draft._id.toString(),
      })
      .expect(400);
    expect(res.body.error?.code).toBe('INSUFFICIENT_POINTS');
  });
});
