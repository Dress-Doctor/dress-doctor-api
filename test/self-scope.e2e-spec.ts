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
import { redisTestEnv } from './redis-test-env';
import { seedBaseline } from './seed-baseline';
import { testUserReference } from './user-reference';

/**
 * §2.3 acceptance over HTTP with the REAL seeded Customer role (not synthetic
 * abilities): the `$self` CASL conditions must make every cross-customer read
 * a plain 404, and booking must be self-only however the client fills
 * `customerId`. This is the portal's security contract.
 */
describe('Customer self-scope + booking (e2e)', () => {
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

  type Cust = {
    userId: Types.ObjectId;
    customerId: string; // Customer profile _id
    customerCode: string; // What every by-customer URL is addressed by
    token: string;
  };
  let alice: Cust;
  let bob: Cust;

  const model = (name: string) => app.get(getModelToken(name));
  const as = (token: string) => (r: request.Test) =>
    r.set(apiHeaders).set('Authorization', `Bearer ${token}`);
  const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString();

  const makeCustomer = async (
    name: string,
    phone: string,
    code: string,
  ): Promise<Cust> => {
    const customerType = await model('UserType').findOne({
      userTypeName: 'CUSTOMER',
    });
    const customerRole = await model('Role').findOne({ roleName: 'Customer' });
    const user = await model('User').create({
      reference: testUserReference(),
      firstName: name,
      lastName: 'SelfScope',
      phone,
      whatsappPhone: `237${phone}`,
      userTypeId: customerType._id,
    });
    await model('UserRole').create({
      userId: user._id,
      roleId: customerRole._id,
    });
    const profile = await model('Customer').create({
      userId: user._id,
      customerCode: `CU-${code}`,
      referralCode: `RF-${code}`,
    });
    const token = await app.get(JwtService).signAsync({
      sub: user._id.toString(),
      phone,
      userType: 'CUSTOMER',
    });
    return {
      userId: user._id,
      customerId: profile._id.toString(),
      customerCode: profile.customerCode,
      token,
    };
  };

  beforeAll(async () => {
    rs = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    Object.assign(process.env, {
      DATABASE_URL: rs.getUri('self-e2e'),
      ...redisTestEnv('self'),
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

    // The baseline data no longer seeds itself on boot: ask for it, and
    // wait for it to finish rather than polling for its last row.
    await seedBaseline(app as never);
    const apiClientModel = model('ApiClient');
    await apiClientModel.create({
      name: 'e2e',
      key: 'e2e-key',
      secretHash: await bcrypt.hash('e2e-secret', 10),
      scope: ['WEB'],
      isActive: true,
    });

    alice = await makeCustomer('Alice', '633333301', 'ALICE1');
    bob = await makeCustomer('Bob', '633333302', 'BOB001');
  });

  afterAll(async () => {
    await app?.close();
    await rs?.stop();
  });

  it('a customer reads their OWN profile, orders, rewards, referral, balance, subscription', async () => {
    const get = (path: string) =>
      as(alice.token)(request(app.getHttpServer()).get(path)).expect(200);

    const profile = await get(`/api/v1/customers/${alice.customerCode}`);
    expect(profile.body.data.customerCode).toBe('CU-ALICE1');

    const orders = await get(`/api/v1/customers/${alice.customerCode}/orders`);
    expect(orders.body.success).toBe(true);

    const rewards = await get(
      `/api/v1/customers/${alice.customerCode}/rewards`,
    );
    expect(rewards.body.data.balance).toBe(0);

    const referral = await get(
      `/api/v1/customers/${alice.customerCode}/referral`,
    );
    expect(referral.body.data.referralCode).toBe('RF-ALICE1');
    expect(referral.body.data.referredCount).toBe(0);

    const balance = await get(
      `/api/v1/customers/${alice.customerCode}/balance`,
    );
    expect(balance.body.data.outstanding).toBe(0);

    const sub = await get(
      `/api/v1/customers/${alice.customerCode}/subscription`,
    );
    expect(sub.body.data.subscription).toBeNull();

    // The detail dashboard's own reads. A customer with nothing on the books
    // must come back as zeros, not as empty cards or a 500.
    const summary = await get(
      `/api/v1/customers/${alice.customerCode}/summary`,
    );
    expect(summary.body.data.orders).toEqual({
      total: 0,
      cancelled: 0,
      withoutPickup: 0,
      paidInFull: 0,
    });
    expect(summary.body.data.spend).toEqual({
      ordered: 0,
      paid: 0,
      outstanding: 0,
      outstandingOrders: 0,
    });
    // Never ordered: a lead, not a risk.
    expect(summary.body.data.activity.atRisk).toBe(false);
    // The seeded Customer role reads payments but not pickups, so the pickup
    // count comes back absent rather than as a zero the reader would take for
    // a fact, while the payment side is a real empty.
    expect(summary.body.data.totalPickups).toBeNull();
    expect(summary.body.data.methods).toEqual([]);
    expect(summary.body.data.payments.count).toBe(0);

    const trend = await get(
      `/api/v1/customers/${alice.customerCode}/spend-trend?months=3`,
    );
    // Every month present, even the empty ones — a chart that skips quiet
    // months shows a steady customer where there was a pause.
    expect(trend.body.data.months).toHaveLength(3);
    expect(trend.body.data.months[0].paid).toBe(0);

    const timeline = await get(
      `/api/v1/customers/${alice.customerCode}/timeline`,
    );
    /*
     * Nothing on the books means no trade on the timeline — no order, no
     * payment, no pickup. It does not mean an empty timeline: the account
     * being set up is itself something that happened, and it is on the trail.
     *
     * This used to assert `[]`, which held only because the fixture creates
     * the customer with no actor behind it and `changedBy` was required, so
     * those audit rows failed validation and were dropped. The rows are kept
     * now, and a customer registered through the API always had them anyway —
     * `register()` supplies the actor.
     */
    const kinds = timeline.body.data.map((event: any) => event.kind);
    expect(kinds).not.toContain('ORDER_CREATED');
    expect(kinds).not.toContain('PAYMENT_RECORDED');
    expect(kinds).not.toContain('PICKUP_REQUESTED');
    expect(new Set(kinds)).toEqual(new Set(['PROFILE_CHANGED']));
  });

  it('the dedicated pickup view refuses a role that cannot read pickups', async () => {
    // Unlike the dashboard summary, which drops the section it may not show,
    // this endpoint exists to serve one collection: a caller who cannot read
    // it is told so rather than handed an empty list reading as "none".
    const res = await as(alice.token)(
      request(app.getHttpServer()).get(
        `/api/v1/customers/${alice.customerCode}/pickups`,
      ),
    );

    // 403, not 400: the request was fine, the caller simply may not read
    // pickups. The console tells the two apart and only toasts the second.
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it("cross-customer access is a 404 on EVERY self view (Alice → Bob's ids)", async () => {
    for (const path of [
      `/api/v1/customers/${bob.customerCode}`,
      `/api/v1/customers/${bob.customerCode}/orders`,
      `/api/v1/customers/${bob.customerCode}/rewards`,
      `/api/v1/customers/${bob.customerCode}/referral`,
      `/api/v1/customers/${bob.customerCode}/balance`,
      `/api/v1/customers/${bob.customerCode}/subscription`,
      `/api/v1/customers/${bob.customerCode}/summary`,
      `/api/v1/customers/${bob.customerCode}/spend-trend`,
      `/api/v1/customers/${bob.customerCode}/history`,
      `/api/v1/customers/${bob.customerCode}/timeline`,
    ]) {
      const res = await as(alice.token)(request(app.getHttpServer()).get(path));
      expect([404]).toContain(res.status);
      expect(res.body.error?.code).toBe('NOT_FOUND');
    }
  });

  it('booking: a customer creates + prices their OWN draft order from the portal', async () => {
    const currencyId = (
      await model('Currency').findOne({ isoCode: 'XAF' })
    )._id.toString();

    // Quote first (the portal estimate) — same engine as order intake.
    const quote = await as(alice.token)(
      request(app.getHttpServer()).post('/api/v1/pricing/quote'),
    )
      .send({
        pricingModel: 'PER_KG',
        totalWeightKg: 4,
        customerId: alice.userId.toString(),
      })
      .expect(200);
    expect(quote.body.data.total).toBe(4000);

    await as(alice.token)(request(app.getHttpServer()).post('/api/v1/orders'))
      .send({
        customerId: alice.userId.toString(),
        currencyId,
        pricingModel: 'PER_KG',
        totalWeightKg: 4,
        estimatedDeliveryDate: tomorrow(),
      })
      .expect(201);

    const order = await model('Order').findOne({ customerId: alice.userId });
    expect(order.totalAmount).toBe(4000); // server-priced, never client-sent

    // Their own order shows up in their history…
    const orders = await as(alice.token)(
      request(app.getHttpServer()).get(
        `/api/v1/customers/${alice.customerCode}/orders`,
      ),
    ).expect(200);
    expect(orders.body.total).toBe(1);

    // …and Bob sees none of it.
    const bobOrders = await as(bob.token)(
      request(app.getHttpServer()).get('/api/v1/orders'),
    ).expect(200);
    expect(bobOrders.body.total).toBe(0);
  });

  it('booking for ANOTHER customer is refused (404), whatever the body says', async () => {
    const currencyId = (
      await model('Currency').findOne({ isoCode: 'XAF' })
    )._id.toString();

    const res = await as(alice.token)(
      request(app.getHttpServer()).post('/api/v1/orders'),
    )
      .send({
        customerId: bob.userId.toString(), // spoof attempt
        currencyId,
        pricingModel: 'PER_KG',
        totalWeightKg: 2,
        estimatedDeliveryDate: tomorrow(),
      })
      .expect(404);
    expect(res.body.error?.code).toBe('NOT_FOUND');

    const bobOrders = await model('Order').countDocuments({
      customerId: bob.userId,
    });
    expect(bobOrders).toBe(0);
  });

  it('self-service profile edit updates contact + opt-in; cross-customer PATCH is 404', async () => {
    await as(alice.token)(
      request(app.getHttpServer()).patch(
        `/api/v1/customers/${alice.customerCode}`,
      ),
    )
      .send({
        whatsappPhone: '237699999999',
        preferredLanguage: 'en',
        notificationsOptIn: false,
        pickupAddress: 'Bonapriso, Douala',
      })
      .expect(200);

    const user = await model('User').findById(alice.userId);
    const profile = await model('Customer').findById(alice.customerId);
    expect(user.whatsappPhone).toBe('237699999999');
    expect(profile.notificationsOptIn).toBe(false);
    expect(profile.pickupAddress).toBe('Bonapriso, Douala');

    // The edit is on the trail, with the reason that was given for it — the
    // half of an audit entry that says why, not just what.
    const history = await as(alice.token)(
      request(app.getHttpServer()).get(
        `/api/v1/customers/${alice.customerCode}/history`,
      ),
    ).expect(200);

    const entries = history.body.data as {
      source: string;
      reason?: string;
      changes: { field: string }[];
    }[];
    expect(entries.length).toBeGreaterThan(0);
    // Both records moved, and the trail says which one each entry came from.
    expect(entries.map((entry) => entry.source)).toEqual(
      expect.arrayContaining(['customer', 'user']),
    );
    expect(
      entries.some((entry) =>
        entry.changes.some((change) => change.field === 'pickupAddress'),
      ),
    ).toBe(true);
    // The stored snapshot never leaves the server.
    expect(entries[0]).not.toHaveProperty('snapshot');

    await as(alice.token)(
      request(app.getHttpServer()).patch(
        `/api/v1/customers/${bob.customerCode}`,
      ),
    )
      .send({ whatsappPhone: '237600000000' })
      .expect(404);
  });
});
