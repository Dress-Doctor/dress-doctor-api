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
    return { userId: user._id, customerId: profile._id.toString(), token };
  };

  beforeAll(async () => {
    rs = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    Object.assign(process.env, {
      DATABASE_URL: rs.getUri('self-e2e'),
      REDIS_HOST: process.env.REDIS_HOST ?? '127.0.0.1',
      REDIS_PORT: process.env.REDIS_PORT ?? '6379',
      REDIS_NAME: `self-e2e-${Date.now()}`,
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

    const profile = await get(`/api/v1/customers/${alice.customerId}`);
    expect(profile.body.data.customerCode).toBe('CU-ALICE1');

    const orders = await get(`/api/v1/customers/${alice.customerId}/orders`);
    expect(orders.body.success).toBe(true);

    const rewards = await get(`/api/v1/customers/${alice.customerId}/rewards`);
    expect(rewards.body.data.balance).toBe(0);

    const referral = await get(
      `/api/v1/customers/${alice.customerId}/referral`,
    );
    expect(referral.body.data.referralCode).toBe('RF-ALICE1');
    expect(referral.body.data.referredCount).toBe(0);

    const balance = await get(`/api/v1/customers/${alice.customerId}/balance`);
    expect(balance.body.data.outstanding).toBe(0);

    const sub = await get(`/api/v1/customers/${alice.customerId}/subscription`);
    expect(sub.body.data.subscription).toBeNull();
  });

  it("cross-customer access is a 404 on EVERY self view (Alice → Bob's ids)", async () => {
    for (const path of [
      `/api/v1/customers/${bob.customerId}`,
      `/api/v1/customers/${bob.customerId}/orders`,
      `/api/v1/customers/${bob.customerId}/rewards`,
      `/api/v1/customers/${bob.customerId}/referral`,
      `/api/v1/customers/${bob.customerId}/balance`,
      `/api/v1/customers/${bob.customerId}/subscription`,
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
        `/api/v1/customers/${alice.customerId}/orders`,
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
        `/api/v1/customers/${alice.customerId}`,
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

    await as(alice.token)(
      request(app.getHttpServer()).patch(`/api/v1/customers/${bob.customerId}`),
    )
      .send({ whatsappPhone: '237600000000' })
      .expect(404);
  });
});
