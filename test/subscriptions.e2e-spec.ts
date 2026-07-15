/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-require-imports */
import {
  INestApplication,
  RequestMethod,
  VersioningType,
} from '@nestjs/common';
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

/**
 * Subscription module over HTTP (§2.2): plan catalog, lifecycle, and the
 * PER_UNIT pieces-overage acceptance path — an over-quota pieces order bills
 * ONLY the excess at standard catalog price (priciest pieces covered first)
 * and decrements remainingQuota exactly once, in the confirm transaction.
 */
describe('Subscriptions + pieces overage (e2e)', () => {
  jest.setTimeout(120000);

  let app: INestApplication;
  let rs: MongoMemoryReplSet;
  const apiHeaders = { 'x-api-key': 'e2e-key', 'x-api-secret': 'e2e-secret' };
  let adminToken: string;
  let customerUserId: Types.ObjectId;
  let subscriptionId: string;

  const model = (name: string) => app.get(getModelToken(name));
  const auth = (r: request.Test) =>
    r.set(apiHeaders).set('Authorization', `Bearer ${adminToken}`);
  const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString();

  beforeAll(async () => {
    rs = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    Object.assign(process.env, {
      DATABASE_URL: rs.getUri('subs-e2e'),
      REDIS_HOST: process.env.REDIS_HOST ?? '127.0.0.1',
      REDIS_PORT: process.env.REDIS_PORT ?? '6379',
      REDIS_NAME: `subs-e2e-${Date.now()}`,
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
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
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

    const adminType = await model('UserType').findOne({
      userTypeName: 'ADMIN',
    });
    const manager = await model('Role').findOne({ roleName: 'Manager' });
    const admin = await model('User').create({
      firstName: 'E2E',
      lastName: 'Admin',
      phone: '690000020',
      whatsappPhone: '690000020',
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

    const customerType = await model('UserType').findOne({
      userTypeName: 'CUSTOMER',
    });
    const customer = await model('User').create({
      firstName: 'Sub',
      lastName: 'Customer',
      phone: '622222200',
      whatsappPhone: '237622222200',
      userTypeId: customerType._id,
    });
    customerUserId = customer._id;
    await model('Customer').create({
      userId: customer._id,
      customerCode: 'CU-E2E002',
      referralCode: 'RF-E2E002',
    });
  });

  afterAll(async () => {
    await app?.close();
    await rs?.stop();
  });

  it('GET /subscription-plans returns the seeded catalog', async () => {
    const res = await auth(
      request(app.getHttpServer()).get('/api/v1/subscription-plans'),
    ).expect(200);

    expect(res.body.success).toBe(true);
    const names = res.body.data.map((p: { planName: string }) => p.planName);
    expect(names).toEqual(
      expect.arrayContaining(['Basic', 'Standard', 'Premium', 'Basic KG']),
    );
  });

  it('POST /subscriptions enrols the customer with plan-snapshotted quota', async () => {
    const basic = await model('SubscriptionPlan').findOne({
      planName: 'Basic',
    });

    const res = await auth(
      request(app.getHttpServer()).post('/api/v1/subscriptions'),
    )
      .send({
        customerId: customerUserId.toString(),
        planId: basic._id.toString(),
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.quotaType).toBe('PIECES');
    expect(res.body.data.remainingQuota).toBe(40);
    subscriptionId = res.body.data._id;

    // Second live enrolment is rejected.
    const dup = await auth(
      request(app.getHttpServer()).post('/api/v1/subscriptions'),
    )
      .send({
        customerId: customerUserId.toString(),
        planId: basic._id.toString(),
      })
      .expect(409);
    expect(dup.body.error?.code).toBe('SUBSCRIPTION_EXISTS');
  });

  it('an over-quota pieces order bills ONLY the excess at catalog price and decrements once at confirm', async () => {
    // Catalog: two items with company-wide prices — suit 3000, shirt 500.
    const serviceTypeId = (
      await model('ServiceType').findOne({})
    )._id.toString();
    const currency = await model('Currency').findOne({ isoCode: 'XAF' });
    const items = await model('Item').find({}).limit(2);
    const [suit, shirt] = items;
    // NB: pre-cast ids — the Price path doesn't cast string ids on insert,
    // and the pricing engine queries with ObjectIds (as all app code does).
    await model('Price').create([
      {
        itemId: suit._id,
        serviceTypeId: new Types.ObjectId(serviceTypeId),
        officeId: null,
        currencyId: currency._id,
        unitPrice: 3000,
        effectiveFrom: new Date(Date.now() - 1000),
        isActive: true,
      },
      {
        itemId: shirt._id,
        serviceTypeId: new Types.ObjectId(serviceTypeId),
        officeId: null,
        currencyId: currency._id,
        unitPrice: 500,
        effectiveFrom: new Date(Date.now() - 1000),
        isActive: true,
      },
    ]);

    // Tighten the quota so overage is easy to assert: 2 pieces left.
    await model('Subscription').updateOne(
      { _id: new Types.ObjectId(subscriptionId) },
      { remainingQuota: 2 },
    );

    // SUBSCRIPTION order: suit ×1 + shirt ×2 = 3 pieces. Quota 2 covers the
    // priciest two (suit 3000 + one shirt 500); excess = one shirt → 500 XAF.
    await auth(request(app.getHttpServer()).post('/api/v1/orders'))
      .send({
        customerId: customerUserId.toString(),
        currencyId: currency._id.toString(),
        pricingModel: 'SUBSCRIPTION',
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
      .send({ itemId: suit._id.toString(), serviceTypeId, quantity: 1 })
      .expect(201);
    await auth(
      request(app.getHttpServer()).post(`/api/v1/orders/${orderId}/items`),
    )
      .send({ itemId: shirt._id.toString(), serviceTypeId, quantity: 2 })
      .expect(201);

    const priced = await model('Order').findById(orderId);
    expect(priced.orderAmount).toBe(500); // excess shirt only
    expect(priced.totalAmount).toBe(500);
    expect(priced.quotaConsumed).toBe(2);

    // Draft repricing must NOT have touched the subscription.
    let sub = await model('Subscription').findById(subscriptionId);
    expect(sub.remainingQuota).toBe(2);

    // Confirm → decrement exactly once, inside the confirm txn.
    await auth(
      request(app.getHttpServer()).post(`/api/v1/orders/${orderId}/confirm`),
    ).expect(200);
    sub = await model('Subscription').findById(subscriptionId);
    expect(sub.remainingQuota).toBe(0);

    // Re-confirm is an illegal transition — no second decrement possible.
    await auth(
      request(app.getHttpServer()).post(`/api/v1/orders/${orderId}/confirm`),
    ).expect(409);
    sub = await model('Subscription').findById(subscriptionId);
    expect(sub.remainingQuota).toBe(0);
  });

  it('lifecycle: pause → resume → cancel over HTTP', async () => {
    await auth(
      request(app.getHttpServer()).post(
        `/api/v1/subscriptions/${subscriptionId}/pause`,
      ),
    ).expect(200);
    await auth(
      request(app.getHttpServer()).post(
        `/api/v1/subscriptions/${subscriptionId}/resume`,
      ),
    ).expect(200);
    await auth(
      request(app.getHttpServer()).post(
        `/api/v1/subscriptions/${subscriptionId}/cancel`,
      ),
    ).expect(200);

    const sub = await model('Subscription').findById(subscriptionId);
    expect(sub.status).toBe('CANCELLED');

    // Cancelled can't resume.
    await auth(
      request(app.getHttpServer()).post(
        `/api/v1/subscriptions/${subscriptionId}/resume`,
      ),
    ).expect(409);
  });
});
