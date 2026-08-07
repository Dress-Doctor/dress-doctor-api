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

  describe('order creation: note and office', () => {
    let currencyId: string;
    let customerTypeId: string;
    let offices: Array<{ _id: Types.ObjectId }>;

    /** One draft per customer is enforced, so every case needs its own. */
    const newCustomer = async (phone: string) => {
      const customer = await model('User').create({
        firstName: 'Note',
        lastName: 'Probe',
        phone,
        whatsappPhone: phone,
        userTypeId: customerTypeId,
      });
      return customer._id.toString();
    };

    const body = (customerId: string) => ({
      customerId,
      currencyId,
      pricingModel: 'PER_KG',
      totalWeightKg: 3,
      estimatedDeliveryDate: tomorrow(),
    });

    beforeAll(async () => {
      currencyId = (
        await model('Currency').findOne({ isoCode: 'XAF' })
      )._id.toString();
      customerTypeId = (
        await model('UserType').findOne({ userTypeName: 'CUSTOMER' })
      )._id.toString();
      offices = await model('Office').find({}).limit(2);
    });

    it('stores the note the customer gave us', async () => {
      const customerId = await newCustomer('644000001');
      const note =
        'No starch on the blue shirt; collar stain on the white one.';

      await auth(request(app.getHttpServer()).post('/api/v1/orders'))
        .send({ ...body(customerId), note })
        .expect(201);

      const order = await model('Order').findOne({
        customerId: new Types.ObjectId(customerId),
      });
      expect(order.note).toBe(note);
    });

    it('leaves the note unset when none is given', async () => {
      const customerId = await newCustomer('644000002');

      await auth(request(app.getHttpServer()).post('/api/v1/orders'))
        .send(body(customerId))
        .expect(201);

      const order = await model('Order').findOne({
        customerId: new Types.ObjectId(customerId),
      });
      expect(order.note).toBeUndefined();
    });

    it('rejects a note longer than the column allows', async () => {
      const customerId = await newCustomer('644000003');

      await auth(request(app.getHttpServer()).post('/api/v1/orders'))
        .send({ ...body(customerId), note: 'x'.repeat(1001) })
        .expect(400);
    });

    it('books into the office a global role asks for', async () => {
      const customerId = await newCustomer('644000004');
      const target = offices[1]._id.toString();

      await auth(request(app.getHttpServer()).post('/api/v1/orders'))
        .send({ ...body(customerId), officeId: target })
        .expect(201);

      const order = await model('Order').findOne({
        customerId: new Types.ObjectId(customerId),
      });
      expect(order.officeId.toString()).toBe(target);
    });

    it('updates the note on a draft, and clears it on an empty string', async () => {
      const customerId = await newCustomer('644000006');

      await auth(request(app.getHttpServer()).post('/api/v1/orders'))
        .send({ ...body(customerId), note: 'Original instruction' })
        .expect(201);

      const created = await model('Order').findOne({
        customerId: new Types.ObjectId(customerId),
      });

      await auth(
        request(app.getHttpServer()).patch(`/api/v1/orders/${created._id}`),
      )
        .send({ note: 'Customer called back: no bleach' })
        .expect(200);

      let order = await model('Order').findById(created._id);
      expect(order.note).toBe('Customer called back: no bleach');

      await auth(
        request(app.getHttpServer()).patch(`/api/v1/orders/${created._id}`),
      )
        .send({ note: '' })
        .expect(200);

      order = await model('Order').findById(created._id);
      expect(order.note).toBeUndefined();
    });

    it('rejects an officeId that does not exist', async () => {
      const customerId = await newCustomer('644000005');

      const res = await auth(
        request(app.getHttpServer()).post('/api/v1/orders'),
      )
        .send({
          ...body(customerId),
          officeId: new Types.ObjectId().toString(),
        })
        .expect(400);

      expect(res.body.error?.code ?? res.body.code).toBe('INVALID_OFFICE');
    });
  });

  /**
   * The KPI numbers come out of an aggregation, so mocks prove nothing about
   * them — these run the real pipeline against Mongo.
   *
   * Every order here belongs to one customer named "Kpi", and the requests
   * filter on that keyword, so counts stay exact no matter what other suites
   * leave in the database.
   */
  describe('order KPIs (real aggregation)', () => {
    const statusCounts: Record<string, number> = {
      DRAFT: 2,
      CONFIRMED: 2,
      RECEIVED: 1,
      WASHING: 1,
      READY: 3,
      DELIVERED: 4,
      CANCELLED: 1,
    };

    // Fixed rather than random, so the pickedUpBy filter has something to name.
    const agentId = new Types.ObjectId();
    let officeCode: string;
    let otherOfficeCode: string;

    beforeAll(async () => {
      const [office, otherOffice] = await model('Office').find({}).limit(2);
      officeCode = office.officeCode;
      otherOfficeCode = otherOffice.officeCode;
      const currency = await model('Currency').findOne({ isoCode: 'XAF' });
      const customerType = await model('UserType').findOne({
        userTypeName: 'CUSTOMER',
      });
      const customer = await model('User').create({
        firstName: 'Kpi',
        lastName: 'Probe',
        phone: '633333333',
        whatsappPhone: '633333333',
        userTypeId: customerType._id,
      });

      let n = 0;
      for (const [name, count] of Object.entries(statusCounts)) {
        const status = await model('OrderStatus').findOne({
          orderStatusName: name,
        });
        for (let i = 0; i < count; i++) {
          await model('Order').create({
            customerId: customer._id,
            currencyId: currency._id,
            officeId: office._id,
            orderCode: `OR-KPI-${n++}`,
            pricingModel: 'PER_KG',
            estimatedDeliveryDate: new Date(),
            orderStatusId: status._id,
            receivedAt: new Date(),
            createdBy: new Types.ObjectId(),
            pickedUpBy: agentId,
          });
        }
      }
    });

    const kpis = (query = '') =>
      auth(
        request(app.getHttpServer()).get(
          `/api/v1/orders/kpis?keyword=Kpi${query}`,
        ),
      ).expect(200);

    it('returns the four headline figures over the filtered set', async () => {
      const res = await kpis();
      const data = res.body.data;

      expect(res.body.success).toBe(true);
      expect(data.totalOrders).toBe(14);
      expect(data.inProgress).toBe(4); // 2 confirmed + 1 received + 1 washing
      expect(data.readyForCollection).toBe(3);
      // 4 delivered / (14 − 1 cancelled) = 30.8%
      expect(data.completionBase).toBe(13);
      expect(data.completionRate).toBe(30.8);
    });

    it('reconciles with the list endpoint on the same filters', async () => {
      const [kpi, list] = await Promise.all([
        kpis(),
        auth(
          request(app.getHttpServer()).get('/api/v1/orders?keyword=Kpi&size=1'),
        ).expect(200),
      ]);

      // Same filters, same set — the cards and the table must never disagree.
      expect(kpi.body.data.totalOrders).toBe(list.body.total);
      // The list no longer carries a status breakdown; the KPI endpoint owns it.
      expect(list.body.byOrderStatus).toBeUndefined();
    });

    const fullBreakdown = {
      all: 14,
      draft: 2,
      confirmed: 2,
      received: 1,
      washing: 1,
      ready: 3,
      delivered: 4,
      cancelled: 1,
    };

    it('narrows the headline figures on orderStatus', async () => {
      const res = await kpis('&orderStatus=READY');

      // Every param applies, so the set is the 3 READY orders and nothing else.
      expect(res.body.data.totalOrders).toBe(3);
      expect(res.body.data.readyForCollection).toBe(3);
      expect(res.body.data.delivered).toBe(0);
      expect(res.body.data.completionRate).toBe(0);
    });

    it('keeps the breakdown across every status on every response', async () => {
      // Same numbers with the status filter on and off — this is what a tab
      // strip reads, so selecting a tab must not erase the other tabs.
      const [unfiltered, filtered] = await Promise.all([
        kpis(),
        kpis('&orderStatus=READY'),
      ]);

      expect(unfiltered.body.data.byOrderStatus).toEqual(fullBreakdown);
      expect(filtered.body.data.byOrderStatus).toEqual(fullBreakdown);
    });

    it('narrows on paymentStatus, breakdown included', async () => {
      // The fixtures are all UNPAID (nothing has been paid against them).
      const [unpaid, paid] = await Promise.all([
        kpis('&paymentStatus=UNPAID'),
        kpis('&paymentStatus=PAID'),
      ]);

      expect(unpaid.body.data.totalOrders).toBe(14);
      expect(unpaid.body.data.byOrderStatus).toEqual(fullBreakdown);

      // A filter that matches nothing empties the breakdown too — it is not
      // held back the way orderStatus is.
      expect(paid.body.data.totalOrders).toBe(0);
      expect(paid.body.data.byOrderStatus.all).toBe(0);
    });

    it('narrows the list on paymentStatus', async () => {
      const res = await auth(
        request(app.getHttpServer()).get(
          '/api/v1/orders?keyword=Kpi&paymentStatus=PAID',
        ),
      ).expect(200);

      expect(res.body.total).toBe(0);
      expect(res.body.data).toHaveLength(0);
    });

    it('rejects an unknown paymentStatus', async () => {
      await auth(
        request(app.getHttpServer()).get('/api/v1/orders?paymentStatus=NOPE'),
      ).expect(400);
    });

    it('narrows on pricingModel', async () => {
      // The fixtures are all PER_KG.
      const [perKg, perPiece] = await Promise.all([
        kpis('&pricingModel=PER_KG'),
        kpis('&pricingModel=PER_PIECE'),
      ]);

      expect(perKg.body.data.totalOrders).toBe(14);
      expect(perPiece.body.data.totalOrders).toBe(0);
    });

    it('narrows on pickedUpBy', async () => {
      const [mine, someoneElse] = await Promise.all([
        kpis(`&pickedUpBy=${agentId.toString()}`),
        kpis(`&pickedUpBy=${new Types.ObjectId().toString()}`),
      ]);

      expect(mine.body.data.totalOrders).toBe(14);
      expect(someoneElse.body.data.totalOrders).toBe(0);
    });

    it('narrows on officeCode, case-insensitively', async () => {
      const [own, lowercased, other, unknown] = await Promise.all([
        kpis(`&officeCode=${officeCode}`),
        kpis(`&officeCode=${officeCode.toLowerCase()}`),
        kpis(`&officeCode=${otherOfficeCode}`),
        kpis('&officeCode=NO-SUCH-OFFICE'),
      ]);

      expect(own.body.data.totalOrders).toBe(14);
      expect(lowercased.body.data.totalOrders).toBe(14);
      // Every fixture order belongs to the first office.
      expect(other.body.data.totalOrders).toBe(0);
      // An unknown code is an empty answer, not an error.
      expect(unknown.body.data.totalOrders).toBe(0);
    });

    it('rejects an unknown pricingModel and a malformed pickedUpBy', async () => {
      await auth(
        request(app.getHttpServer()).get('/api/v1/orders?pricingModel=NOPE'),
      ).expect(400);
      await auth(
        request(app.getHttpServer()).get('/api/v1/orders?pickedUpBy=not-an-id'),
      ).expect(400);
    });

    it('narrows with the date window like the list does', async () => {
      const past = new Date(Date.now() - 90 * 86_400_000).toISOString();
      const res = await kpis(
        `&startDate=${past}&endDate=${new Date(Date.now() - 60 * 86_400_000).toISOString()}`,
      );

      expect(res.body.data.totalOrders).toBe(0);
      expect(res.body.data.completionRate).toBe(0);
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

    /** A customer per case: one draft order per customer is enforced. */
    const bookingCustomer = async (phone: string) => {
      const customerType = await model('UserType').findOne({
        userTypeName: 'CUSTOMER',
      });
      return model('User').create({
        firstName: 'Scoped',
        lastName: 'Booking',
        phone,
        whatsappPhone: phone,
        userTypeId: customerType._id,
      });
    };

    /** Returns the supertest Test itself, so callers can chain `.expect()`. */
    const bookInto = (
      customerId: string,
      officeId: string,
      currencyId: string,
    ) =>
      scoped(request(app.getHttpServer()).post('/api/v1/orders')).send({
        customerId,
        officeId,
        currencyId,
        pricingModel: 'PER_KG',
        totalWeightKg: 2,
        estimatedDeliveryDate: tomorrow(),
      });

    const xaf = async () =>
      (await model('Currency').findOne({ isoCode: 'XAF' }))._id.toString();

    it('office-A staff cannot book into an office they are not posted to', async () => {
      const [, officeB] = await model('Office').find({}).limit(2);
      const customer = await bookingCustomer('655000001');

      const res = await bookInto(
        customer._id.toString(),
        officeB._id.toString(),
        await xaf(),
      ).expect(400);

      expect(res.body.error?.code ?? res.body.code).toBe('OFFICE_OUT_OF_SCOPE');
      // Refused outright — not quietly filed into their own office instead.
      const order = await model('Order').findOne({ customerId: customer._id });
      expect(order).toBeNull();
    });

    it('books into a second office once the staff member is posted there', async () => {
      const [officeA, officeB] = await model('Office').find({}).limit(2);
      const customer = await bookingCustomer('655000002');

      // Same staff, now working out of both offices.
      const staff = await model('User').findOne({ phone: '622222222' });
      const role = await model('Role').findOne({ roleName: 'Office Manager' });
      await model('OfficeUser').create({
        userId: staff._id,
        roleId: role._id,
        officeId: officeB._id,
      });

      await bookInto(
        customer._id.toString(),
        officeB._id.toString(),
        await xaf(),
      ).expect(201);

      const order = await model('Order').findOne({ customerId: customer._id });
      expect(order.officeId.toString()).toBe(officeB._id.toString());
      expect(order.officeId.toString()).not.toBe(officeA._id.toString());
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
