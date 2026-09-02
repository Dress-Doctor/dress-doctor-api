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

/**
 * The pickups list and its KPI companion over HTTP, against the REAL seeded
 * roles — not synthetic abilities. Three things are only provable here:
 *  - office scoping is a query filter, so office-A staff never see office B's
 *    pickups and asking for office B by code returns nothing rather than their
 *    own office's rows relabelled;
 *  - the filters (status name, reference, customer, keyword, date window) run
 *    against real ObjectId storage and a real `$lookup`, which mocks cannot
 *    exercise;
 *  - `byPickupStatus` spans every status while the headline cards narrow with
 *    the status filter — the contract a tab strip is built on.
 */
describe('Pickups list, filters, KPIs + office scoping (e2e)', () => {
  jest.setTimeout(120000);

  let app: INestApplication;
  let rs: MongoMemoryReplSet;

  const apiHeaders = {
    'x-api-key': 'e2e-key',
    'x-api-secret': 'e2e-secret',
    'x-change-reason': 'automated end-to-end test',
  };

  const model = (name: string) => app.get(getModelToken(name));
  const as = (token: string) => (r: request.Test) =>
    r.set(apiHeaders).set('Authorization', `Bearer ${token}`);

  let officeA: any;
  let officeB: any;
  let alice: any;
  let bob: any;
  let statusIds: Record<string, Types.ObjectId>;
  let apiClientId: Types.ObjectId;

  // Office Manager posted to office A, and a global Manager.
  let officeAToken: string;
  let globalToken: string;

  const makeOffice = async (code: string, name: string) => {
    const officeType = await model('OfficeType').findOne();
    return await model('Office').create({
      officeTypeId: officeType._id,
      officeName: name,
      officeCode: code,
      slug: code.toLowerCase(),
      address: `${name} street`,
      city: 'Douala',
      region: 'Littoral',
      signedLink: `https://example.test/o/${code.toLowerCase()}`,
    });
  };

  const makeCustomer = async (
    firstName: string,
    lastName: string,
    phone: string,
  ) => {
    const customerType = await model('UserType').findOne({
      userTypeName: 'CUSTOMER',
    });
    return await model('User').create({
      firstName,
      lastName,
      phone,
      whatsappPhone: `237${phone}`,
      email: `${firstName.toLowerCase()}@pickups.test`,
      userTypeId: customerType._id,
    });
  };

  const makeStaff = async (
    phone: string,
    roleName: string,
    office?: Types.ObjectId,
  ) => {
    const adminType = await model('UserType').findOne({
      userTypeName: 'ADMIN',
    });
    const role = await model('Role').findOne({ roleName });
    const user = await model('User').create({
      firstName: roleName,
      lastName: 'Staff',
      phone,
      userTypeId: adminType._id,
    });
    await model('UserRole').create({ userId: user._id, roleId: role._id });
    if (office)
      await model('OfficeUser').create({
        userId: user._id,
        officeId: office,
        roleId: role._id,
      });

    return await app.get(JwtService).signAsync({
      sub: user._id.toString(),
      phone,
      userType: 'ADMIN',
      office: office?.toString(),
    });
  };

  const makePickup = async (
    office: Types.ObjectId,
    customerId: Types.ObjectId,
    status: string,
    reference: string,
  ) =>
    await model('PickupRequest').create({
      apiClientId,
      customerId,
      reference,
      pickupAddress: 'Bonapriso, Douala',
      pickupDate: new Date(),
      pickupTime: 'MORNING 8AM - 12PM',
      pickupStatusId: statusIds[status],
      officeId: office,
    });

  beforeAll(async () => {
    rs = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    Object.assign(process.env, {
      DATABASE_URL: rs.getUri('pickups-e2e'),
      ...redisTestEnv('pickups'),
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

    // Wait for the boot seed, then add this suite's own api client.
    const apiClientModel = model('ApiClient');
    for (let i = 0; i < 120; i++) {
      if (await apiClientModel.findOne({ name: 'System' })) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    const client = await apiClientModel.create({
      name: 'e2e-pickups',
      key: 'e2e-key',
      secretHash: await bcrypt.hash('e2e-secret', 10),
      scope: ['WEB'],
      isActive: true,
    });
    apiClientId = client._id;

    const statuses = await model('PickupStatus').find();
    statusIds = Object.fromEntries(
      statuses.map((s: any) => [s.pickupStatusName, s._id]),
    );

    officeA = await makeOffice('PKA-01', 'Pickup Office A');
    officeB = await makeOffice('PKB-01', 'Pickup Office B');

    alice = await makeCustomer('Alice', 'Ngassa', '655000101');
    bob = await makeCustomer('Bob', 'Mbarga', '655000102');

    // Office A: 2 pending, 1 picked up, 1 cancelled. Office B: 1 pending.
    await makePickup(officeA._id, alice._id, 'PENDING', 'PU-AAA001');
    await makePickup(officeA._id, bob._id, 'PENDING', 'PU-AAA002');
    await makePickup(officeA._id, alice._id, 'PICKED_UP', 'PU-AAA003');
    await makePickup(officeA._id, bob._id, 'CANCELLED', 'PU-AAA004');
    await makePickup(officeB._id, alice._id, 'PENDING', 'PU-BBB001');

    officeAToken = await makeStaff('655000201', 'Office Manager', officeA._id);
    globalToken = await makeStaff('655000202', 'Manager');
  });

  afterAll(async () => {
    await app?.close();
    await rs?.stop();
  });

  const list = (token: string, qs = '') =>
    as(token)(request(app.getHttpServer()).get(`/api/v1/pickups${qs}`));
  const kpis = (token: string, qs = '') =>
    as(token)(request(app.getHttpServer()).get(`/api/v1/pickups/kpis${qs}`));

  describe('office scoping', () => {
    it("office-A staff see only office A's pickups", async () => {
      const res = await list(officeAToken).expect(200);

      expect(res.body.total).toBe(4);
      const refs = res.body.data.map((p: any) => p.reference).sort();
      expect(refs).toEqual([
        'PU-AAA001',
        'PU-AAA002',
        'PU-AAA003',
        'PU-AAA004',
      ]);
    });

    it('asking for another office by code returns nothing, not own rows', async () => {
      const res = await list(officeAToken, '?officeCode=PKB-01').expect(200);

      expect(res.body.total).toBe(0);
      expect(res.body.data).toEqual([]);
    });

    it('a global manager sees every office, and can narrow by officeCode', async () => {
      const all = await list(globalToken).expect(200);
      expect(all.body.total).toBe(5);

      const scoped = await list(globalToken, '?officeCode=PKB-01').expect(200);
      expect(scoped.body.total).toBe(1);
      expect(scoped.body.data[0].reference).toBe('PU-BBB001');
    });

    it("office-A staff cannot cancel office B's pickup (404, not 403)", async () => {
      const pickupB = await model('PickupRequest').findOne({
        reference: 'PU-BBB001',
      });

      const res = await as(officeAToken)(
        request(app.getHttpServer()).post(
          `/api/v1/pickups/${pickupB._id.toString()}/cancel`,
        ),
      );

      expect(res.status).toBe(404);
      // The pickup is untouched: still PENDING, not CANCELLED.
      const after = await model('PickupRequest').findById(pickupB._id);
      expect(after.pickupStatusId.toString()).toBe(
        statusIds['PENDING'].toString(),
      );
    });
  });

  describe('filters', () => {
    it('filters by status name', async () => {
      const res = await list(officeAToken, '?pickupStatusName=PENDING').expect(
        200,
      );

      expect(res.body.total).toBe(2);
      expect(
        res.body.data.every(
          (p: any) => p.pickupStatusId.pickupStatusName === 'PENDING',
        ),
      ).toBe(true);
    });

    it('rejects a status name that is not a seeded one', async () => {
      const res = await list(officeAToken, '?pickupStatusName=NOPE');
      expect(res.status).toBe(400);
    });

    it('filters by reference, customer and confirmedBy', async () => {
      const byRef = await list(officeAToken, '?reference=PU-AAA003').expect(
        200,
      );
      expect(byRef.body.total).toBe(1);

      const byCustomer = await list(
        officeAToken,
        `?customerId=${alice._id.toString()}`,
      ).expect(200);
      expect(byCustomer.body.total).toBe(2);

      // Nothing has been confirmed, so the filter empties the list.
      const byConfirmer = await list(
        officeAToken,
        `?confirmedById=${alice._id.toString()}`,
      ).expect(200);
      expect(byConfirmer.body.total).toBe(0);
    });

    it('keyword searches customer name, phone, email and reference', async () => {
      for (const [term, expected] of [
        ['Alice', 2],
        ['alice ngassa', 2],
        ['655000102', 2],
        ['alice@pickups.test', 2],
        ['PU-AAA004', 1],
      ] as [string, number][]) {
        const res = await list(
          officeAToken,
          `?keyword=${encodeURIComponent(term)}`,
        ).expect(200);
        expect([term, res.body.total]).toEqual([term, expected]);
      }
    });

    it('windows on createdAt', async () => {
      const past = await list(
        officeAToken,
        '?startDate=2020-01-01&endDate=2020-12-31',
      ).expect(200);
      expect(past.body.total).toBe(0);

      const now = await list(
        officeAToken,
        `?startDate=${new Date(Date.now() - 86_400_000).toISOString()}`,
      ).expect(200);
      expect(now.body.total).toBe(4);
    });

    it('returns the foreign-key documents, not bare ids', async () => {
      const res = await list(officeAToken, '?reference=PU-AAA001').expect(200);
      const pickup = res.body.data[0];

      expect(pickup.customerId.firstName).toBe('Alice');
      expect(pickup.customerId.userTypeId.userTypeName).toBe('CUSTOMER');
      expect(pickup.officeId.officeCode).toBe('PKA-01');
      expect(pickup.officeId.officeTypeId.officeTypeName).toBeDefined();
      expect(pickup.pickupStatusId.pickupStatusName).toBe('PENDING');
      // The api client is joined without its credentials.
      expect(pickup.apiClientId.name).toBe('e2e-pickups');
      expect(pickup.apiClientId.key).toBeUndefined();
      expect(pickup.apiClientId.secretHash).toBeUndefined();
    });
  });

  describe('export', () => {
    const exportCsv = (token: string, qs = '&') =>
      as(token)(
        request(app.getHttpServer()).get(
          `/api/v1/pickups/export?format=csv${qs}`,
        ),
      );

    it('streams a CSV of the caller office pickups only', async () => {
      const res = await exportCsv(officeAToken).expect(200);

      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toMatch(
        /attachment; filename="pickups-export-\d{8}\.csv"/,
      );

      const body = res.text ?? res.body.toString();
      const lines = body
        .replace(/^\uFEFF/, '')
        .trim()
        .split('\r\n');
      expect(lines[0]).toBe(
        [
          'Reference',
          'Customer',
          'Phone',
          'Email',
          'Office',
          'Status',
          'Pickup Address',
          'Pickup Date',
          'Pickup Time',
          'Confirmed By',
          'Created At',
          'Updated At',
        ]
          .map((h) => `"${h}"`)
          .join(','),
      );
      // Four office-A rows + header, and office B never appears.
      expect(lines).toHaveLength(5);
      expect(body).not.toContain('PU-BBB001');
      expect(body).toContain('"Alice Ngassa"');
      expect(body).toContain('"Pickup Office A"');
    });

    it('applies the list filters to the exported set', async () => {
      const res = await exportCsv(
        officeAToken,
        '&pickupStatusName=PENDING',
      ).expect(200);

      const lines = (res.text ?? res.body.toString())
        .replace(/^\uFEFF/, '')
        .trim()
        .split('\r\n');
      expect(lines).toHaveLength(3);
      expect(lines.join('\n')).not.toContain('PU-AAA003');
    });

    it('streams an Excel workbook when asked for one', async () => {
      const res = await as(officeAToken)(
        request(app.getHttpServer()).get('/api/v1/pickups/export?format=excel'),
      )
        // Keep the bytes as a Buffer instead of letting supertest parse them.
        .responseType('blob')
        .expect(200);

      expect(res.headers['content-type']).toContain('spreadsheetml.sheet');
      expect(res.headers['content-disposition']).toMatch(/\.xlsx"/);
      // XLSX is a zip: check the magic bytes rather than parsing it back.
      expect(res.body.slice(0, 2).toString()).toBe('PK');
    });

    it('requires a format, and rejects an unknown one', async () => {
      await as(officeAToken)(
        request(app.getHttpServer()).get('/api/v1/pickups/export'),
      ).expect(400);

      await exportCsv(officeAToken, '').expect(200);
      await as(officeAToken)(
        request(app.getHttpServer()).get('/api/v1/pickups/export?format=pdf'),
      ).expect(400);
    });

    it('is refused for a role without the EXPORT action', async () => {
      // A Driver holds read/update on pickups but was never granted EXPORT.
      const driverToken = await makeStaff('655000203', 'Driver', officeA._id);

      const res = await as(driverToken)(
        request(app.getHttpServer()).get('/api/v1/pickups/export?format=csv'),
      );
      expect(res.status).toBe(400);

      // ...and the same Driver can still read the list.
      await list(driverToken).expect(200);
    });
  });

  describe('kpis', () => {
    it('describes the same set as the list, scoped to the office', async () => {
      const res = await kpis(officeAToken).expect(200);

      expect(res.body.data).toMatchObject({
        totalPickups: 4,
        pending: 2,
        completed: 1,
        // Cancelled is out of the divisor: 1 of 3.
        completionBase: 3,
        completionRate: 33.3,
        byPickupStatus: {
          all: 4,
          pending: 2,
          confirmed: 0,
          assigned: 0,
          pickedUp: 1,
          cancelled: 1,
        },
      });
    });

    it('narrows the cards on a status filter but keeps the breakdown whole', async () => {
      const res = await kpis(officeAToken, '?pickupStatusName=PENDING').expect(
        200,
      );

      expect(res.body.data.totalPickups).toBe(2);
      expect(res.body.data.completed).toBe(0);
      expect(res.body.data.completionRate).toBe(0);
      // The tab strip keeps every count whichever tab is selected.
      expect(res.body.data.byPickupStatus).toMatchObject({
        all: 4,
        pending: 2,
        pickedUp: 1,
        cancelled: 1,
      });
    });

    it('applies every other list filter to the headline figures', async () => {
      const res = await kpis(
        officeAToken,
        `?customerId=${alice._id.toString()}`,
      ).expect(200);

      // Alice has one pending and one picked up in office A.
      expect(res.body.data.totalPickups).toBe(2);
      expect(res.body.data.pending).toBe(1);
      expect(res.body.data.completed).toBe(1);
      expect(res.body.data.completionRate).toBe(50);
    });

    it('counts only the caller office, so the two offices never bleed', async () => {
      const scoped = await kpis(officeAToken).expect(200);
      const global = await kpis(globalToken).expect(200);

      expect(scoped.body.data.totalPickups).toBe(4);
      expect(global.body.data.totalPickups).toBe(5);
      expect(global.body.data.byPickupStatus.pending).toBe(3);
    });
  });

  describe('detail by reference', () => {
    const detail = (token: string, reference: string) =>
      as(token)(
        request(app.getHttpServer()).get(`/api/v1/pickups/${reference}`),
      );

    it('returns the joins, the order raised off it and the audit trail', async () => {
      // Confirm through the API so there is a real trail to read back. Only a
      // Manager holds CONFIRM under the current seed — Office Manager's
      // crud(PickupRequest) does not include it.
      const pending = await model('PickupRequest').findOne({
        reference: 'PU-AAA002',
      });
      await as(globalToken)(
        request(app.getHttpServer()).post(
          `/api/v1/pickups/${pending._id.toString()}/confirm`,
        ),
      ).expect(200);

      // An order raised off the pickup.
      const orderStatus = await model('OrderStatus').findOne({
        orderStatusName: 'DRAFT',
      });
      const currency = await model('Currency').findOne({ isoCode: 'XAF' });
      await model('Order').create({
        orderCode: 'OR-PU0002',
        pickupRequestId: pending._id,
        customerId: bob._id,
        officeId: officeA._id,
        currencyId: currency._id,
        orderStatusId: orderStatus._id,
        estimatedDeliveryDate: new Date(),
        createdBy: alice._id,
        pickedUpBy: alice._id,
        totalAmount: 15000,
        amountPaid: 5000,
        balanceDue: 10000,
      });

      const res = await detail(officeAToken, 'PU-AAA002').expect(200);
      const data = res.body.data;

      expect(data.reference).toBe('PU-AAA002');
      expect(data.customer.firstName).toBe('Bob');
      expect(data.office.officeCode).toBe('PKA-01');
      expect(data.pickupStatus.pickupStatusName).toBe('CONFIRMED');
      expect(data.confirmedByUser.phone).toBe('655000202');

      // The order summary: enough to link to it and show where it stands.
      expect(data.orders).toHaveLength(1);
      expect(data.orders[0]).toMatchObject({
        orderCode: 'OR-PU0002',
        status: 'DRAFT',
        totalAmount: 15000,
        amountPaid: 5000,
        balanceDue: 10000,
      });

      // The trail, newest first, with the status change labelled.
      expect(data.history.length).toBeGreaterThan(0);
      const statusChange = data.history
        .flatMap((entry: any) => entry.changes)
        .find((c: any) => c.field === 'pickupStatusId');
      expect(statusChange).toMatchObject({
        fromLabel: 'PENDING',
        toLabel: 'CONFIRMED',
      });
      expect(data.history[0].changedByUser.phone).toBe('655000202');
      expect(data.history[0].reason).toBe('automated end-to-end test');
    });

    it('never returns the stored snapshot or any secret', async () => {
      const res = await detail(officeAToken, 'PU-AAA001').expect(200);
      const data = res.body.data;

      expect(JSON.stringify(data)).not.toContain('snapshot');
      expect(data.customer.passwordHash).toBeUndefined();
      // The office signed link carries an HMAC.
      expect(data.office.signedLink).toBeUndefined();
    });

    it('accepts a lower-case reference typed off a receipt', async () => {
      const res = await detail(officeAToken, 'pu-aaa001').expect(200);
      expect(res.body.data.reference).toBe('PU-AAA001');
    });

    it("another office's pickup is a 404, not a 403", async () => {
      const res = await detail(officeAToken, 'PU-BBB001');
      expect(res.status).toBe(404);
      expect(res.body.error?.code).toBe('NOT_FOUND');

      // The same reference reads fine for a global manager.
      await detail(globalToken, 'PU-BBB001').expect(200);
    });

    it('an unknown reference is a 404', async () => {
      await detail(officeAToken, 'PU-NOPE99').expect(404);
    });
  });
});
