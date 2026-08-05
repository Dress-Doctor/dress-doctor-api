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
 * Core HTTP e2e against the booted app: a REAL Redis (BullMQ) — provided by a CI
 * service container, or a local redis — and an ephemeral single-node replica-set
 * Mongo (so the money-path transactions work). Proves the cross-cutting contract
 * the two frontends hit first: guard ordering (api-key → JWT → CASL), the
 * response envelope, and pagination. The query-level office/self scoping is
 * covered by casl-scope.e2e-spec.ts.
 */
describe('HTTP contract (e2e)', () => {
  let app: INestApplication;
  let rs: MongoMemoryReplSet;
  const apiHeaders = { 'x-api-key': 'e2e-key', 'x-api-secret': 'e2e-secret' };
  let adminToken: string;

  beforeAll(async () => {
    rs = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    Object.assign(process.env, {
      DATABASE_URL: rs.getUri('test'),
      REDIS_HOST: process.env.REDIS_HOST ?? '127.0.0.1',
      REDIS_PORT: process.env.REDIS_PORT ?? '6379',
      REDIS_NAME: 'e2e',
      JWT_SECRET: 'e2e-secret-min-16-chars',
      JWT_ACCESS_TTL: '15m',
      // CodeGeneratorService passes SALT straight to bcrypt.hash, so it must be a
      // real salt string, not a round count.
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

    // require (not import) so the env above is set before AppModule evaluates
    // BullModule.forRoot(process.env.REDIS_*) and the config schema.
    const { AppModule } = require('../src/app.module');
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    // Mirror src/main.ts so routes + envelope match production.
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

    // The seeder runs fire-and-forget on module init. Poll until it has settled
    // (the 'System' api-client is seeded near the end of the run) so the data is
    // present before tests — without kicking off a second, racing run.
    const apiClientModel = app.get(getModelToken('ApiClient'));
    for (let i = 0; i < 120; i++) {
      if (await apiClientModel.findOne({ name: 'System' })) break;
      await new Promise((r) => setTimeout(r, 500));
    }

    // Add a known api-client + an admin (Manager) user for authenticated calls.
    await apiClientModel.create({
      name: 'e2e',
      key: 'e2e-key',
      secretHash: await bcrypt.hash('e2e-secret', 10),
      scope: ['WEB'],
      isActive: true,
    });

    const userTypeModel = app.get(getModelToken('UserType'));
    const roleModel = app.get(getModelToken('Role'));
    const userModel = app.get(getModelToken('User'));
    const userRoleModel = app.get(getModelToken('UserRole'));

    const adminType = await userTypeModel.findOne({ userTypeName: 'ADMIN' });
    const manager = await roleModel.findOne({ roleName: 'Manager' });
    const admin = await userModel.create({
      firstName: 'E2E',
      lastName: 'Admin',
      phone: '690000000',
      whatsappPhone: '690000000',
      userTypeId: adminType?._id ?? new Types.ObjectId(),
    });
    if (manager) {
      await userRoleModel.create({ userId: admin._id, roleId: manager._id });
    }

    adminToken = await app.get(JwtService).signAsync({
      sub: admin._id.toString(),
      phone: admin.phone,
      userType: 'ADMIN',
    });
  }, 120000);

  afterAll(async () => {
    await app?.close();
    await rs?.stop();
  });

  it('GET /health boots (skips both gates)', async () => {
    await request(app.getHttpServer()).get('/health').expect(200);
  });

  it('rejects a request with no api-key (gate 1) with the error envelope', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/orders')
      .expect(401);

    expect(res.body.success).toBe(false);
    expect(res.body.error?.code).toBeDefined();
    expect(res.body.timestamp).toBeDefined();
  });

  it('with a valid api-key but no JWT, fails at gate 2 (guard ordering)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/orders')
      .set(apiHeaders)
      .expect(401);

    expect(res.body.success).toBe(false);
  });

  it('an authenticated admin gets the success envelope + pagination', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/orders')
      .set(apiHeaders)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    // list contract: total + data + nextPage
    expect(res.body.data).toBeDefined();
    expect(res.body).toHaveProperty('total');
  });

  // Admin-authed request helper.
  const auth = (r: request.Test) =>
    r.set(apiHeaders).set('Authorization', `Bearer ${adminToken}`);
  const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString();
  const model = (name: string) => app.get(getModelToken(name));

  describe('order → payment → flag (full lifecycle over HTTP)', () => {
    let orderId: string;
    let currencyId: string;
    let itemId: string;
    let serviceTypeId: string;
    let methodId: string;
    let typeId: string;
    let customerId: string;

    beforeAll(async () => {
      currencyId = (
        await model('Currency').findOne({ isoCode: 'XAF' })
      )._id.toString();
      itemId = (await model('Item').findOne({}))._id.toString();
      serviceTypeId = (await model('ServiceType').findOne({}))._id.toString();
      methodId = (await model('PaymentMethod').findOne({}))._id.toString();
      typeId = (
        await model('PaymentType').findOne({ paymentTypeName: 'PAYMENT' })
      )._id.toString();
      const customerType = await model('UserType').findOne({
        userTypeName: 'CUSTOMER',
      });
      const customer = await model('User').create({
        firstName: 'Flow',
        lastName: 'Customer',
        phone: '611111111',
        whatsappPhone: '611111111',
        userTypeId: customerType._id,
      });
      customerId = customer._id.toString();
    });

    it('creates → items → confirm → ready → partial payment → flagged', async () => {
      // PER_KG so the price is weight × perKgRate (no catalog Price row needed).
      await auth(request(app.getHttpServer()).post('/api/v1/orders'))
        .send({
          customerId,
          currencyId,
          pricingModel: 'PER_KG',
          totalWeightKg: 5,
          estimatedDeliveryDate: tomorrow(),
        })
        .expect(201);

      const order = await model('Order')
        .findOne({ customerId: new Types.ObjectId(customerId) })
        .sort({ createdAt: -1 });
      orderId = order._id.toString();
      expect(order.totalAmount).toBe(5000); // 5kg × 1000 XAF/kg

      // A garment row (QC), then walk the lifecycle to READY.
      await auth(
        request(app.getHttpServer()).post(`/api/v1/orders/${orderId}/items`),
      )
        .send({ itemId, serviceTypeId, quantity: 1 })
        .expect(201);

      for (const step of ['confirm', 'received', 'washing', 'ready']) {
        await auth(
          request(app.getHttpServer()).post(
            `/api/v1/orders/${orderId}/${step}`,
          ),
        ).expect(200);
      }

      // Partial payment on a READY order → flagged, PARTIAL.
      await auth(
        request(app.getHttpServer()).post(`/api/v1/orders/${orderId}/payments`),
      )
        .send({
          paymentMethodId: methodId,
          paymentTypeId: typeId,
          amount: 2000,
        })
        .expect(201);

      const flagged = await model('Order').findById(orderId);
      expect(flagged.paymentStatus).toBe('PARTIAL');
      expect(flagged.flagged).toBe(true);
      expect(flagged.amountPaid).toBe(2000);

      const res = await auth(
        request(app.getHttpServer()).get('/api/v1/orders/flagged'),
      ).expect(200);
      expect(res.body.success).toBe(true);
      expect(
        res.body.data.some((o: { _id: string }) => o._id === orderId),
      ).toBe(true);
    });

    it('payment is idempotent (same x-idempotency-key → one payment)', async () => {
      const key = 'e2e-idem-key-1';
      const pay = () =>
        auth(
          request(app.getHttpServer()).post(
            `/api/v1/orders/${orderId}/payments`,
          ),
        )
          .set('x-idempotency-key', key)
          .send({
            paymentMethodId: methodId,
            paymentTypeId: typeId,
            amount: 500,
          });

      await pay().expect(201);
      await pay().expect(201); // replay — must not double-count

      const count = await model('Payment').countDocuments({
        orderId: new Types.ObjectId(orderId),
        idempotencyKey: key,
      });
      expect(count).toBe(1);
    });
  });

  describe('by-id office scoping over HTTP', () => {
    let scopedToken: string;
    let orderBId: string;

    beforeAll(async () => {
      const [officeA, officeB] = await model('Office').find({}).limit(2);
      const draft = await model('OrderStatus').findOne({
        orderStatusName: 'DRAFT',
      });
      const staffType = await model('UserType').findOne({
        userTypeName: 'ADMIN',
      });
      const officeManager = await model('Role').findOne({
        roleName: 'Office Manager',
      });

      // Staff scoped to office A (Office Manager → { officeId: '$office' }).
      const staff = await model('User').create({
        firstName: 'Scoped',
        lastName: 'Staff',
        phone: '622222222',
        whatsappPhone: '622222222',
        userTypeId: staffType._id,
      });
      await model('UserRole').create({
        userId: staff._id,
        roleId: officeManager._id,
      });
      scopedToken = await app.get(JwtService).signAsync({
        sub: staff._id.toString(),
        phone: staff.phone,
        userType: 'ADMIN',
        office: officeA._id.toString(),
      });

      // An order that belongs to office B.
      const orderB = await model('Order').create({
        customerId: new Types.ObjectId(),
        currencyId: new Types.ObjectId(),
        officeId: officeB._id,
        orderCode: 'OR-E2E-B',
        pricingModel: 'PER_KG',
        estimatedDeliveryDate: new Date(),
        orderStatusId: draft._id,
        createdBy: new Types.ObjectId(),
        pickedUpBy: new Types.ObjectId(),
      });
      orderBId = orderB._id.toString();
    });

    const scoped = (r: request.Test) =>
      r.set(apiHeaders).set('Authorization', `Bearer ${scopedToken}`);

    it("office-A staff cannot PATCH office B's order (404, not a leak)", async () => {
      await scoped(
        request(app.getHttpServer()).patch(`/api/v1/orders/${orderBId}`),
      )
        .send({ totalWeightKg: 3 })
        .expect(404);
    });

    it('office-A staff cannot pay an out-of-scope order (404)', async () => {
      const method = await model('PaymentMethod').findOne({});
      const type = await model('PaymentType').findOne({
        paymentTypeName: 'PAYMENT',
      });
      await scoped(
        request(app.getHttpServer()).post(
          `/api/v1/orders/${orderBId}/payments`,
        ),
      )
        .send({
          paymentMethodId: method._id.toString(),
          paymentTypeId: type._id.toString(),
          amount: 500,
        })
        .expect(404);
    });
  });
});
