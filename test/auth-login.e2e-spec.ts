/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-require-imports */
import {
  INestApplication,
  RequestMethod,
  VersioningType,
} from '@nestjs/common';
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
 * The deferred pre-portal gate (Phase 3 §0): the OTP login flows proven over
 * HTTP against the booted app — the portal's very first integration is login.
 *
 *  - Customer: OTP-only (no password), code delivered to `whatsappPhone`.
 *  - Staff: 2FA — password checked BEFORE any OTP is issued.
 *
 * OTP capture: codes are bcrypt-hashed at rest (otp_request.codeHash), so the
 * "read the code from the OTP collection" hook can't work post-hash. The test
 * hook instead captures the plaintext at the notification-enqueue boundary
 * (NotificationService.addToQueue), which also proves the OTP is addressed to
 * the channel-correct recipient (the Phase-2 whatsappPhone fix).
 */
describe('OTP login over HTTP (e2e)', () => {
  let app: INestApplication;
  let rs: MongoMemoryReplSet;
  const apiHeaders = { 'x-api-key': 'e2e-key', 'x-api-secret': 'e2e-secret' };

  // Every enqueued notification, captured before it reaches the real queue.
  const outbox: Array<{
    templateName: string;
    otpChannel: string;
    recipients: Array<{ name: string; address: string }>;
    variables: Record<string, string>;
  }> = [];
  const lastOtpCode = () => outbox[outbox.length - 1]?.variables?.code;

  const CUSTOMER_PHONE = '655000001';
  const CUSTOMER_WHATSAPP = '237655000001';
  const STAFF_PHONE = '677000001';
  const STAFF_PASSWORD = 'Staff@12345';

  beforeAll(async () => {
    rs = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    Object.assign(process.env, {
      DATABASE_URL: rs.getUri('test'),
      REDIS_HOST: process.env.REDIS_HOST ?? '127.0.0.1',
      REDIS_PORT: process.env.REDIS_PORT ?? '6379',
      REDIS_NAME: 'e2e-auth',
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

    // require (not import) so the env above is set before AppModule evaluates
    // BullModule.forRoot(process.env.REDIS_*) and the config schema.
    const { AppModule } = require('../src/app.module');
    const {
      NotificationService,
    } = require('../src/helper/service/notification.service');

    // Test hook: intercept delivery at the enqueue boundary. Captures the
    // plaintext OTP (hashed at rest) and keeps the login flow off SMTP/WhatsApp.
    jest
      .spyOn(NotificationService.prototype, 'addToQueue')
      .mockImplementation(async function (payload: unknown) {
        outbox.push(payload as (typeof outbox)[number]);
      });

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

    // Wait for the fire-and-forget seeder (System api-client lands near the end).
    const apiClientModel = app.get(getModelToken('ApiClient'));
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

    const model = (name: string) => app.get(getModelToken(name));
    const customerType = await model('UserType').findOne({
      userTypeName: 'CUSTOMER',
    });
    const adminType = await model('UserType').findOne({
      userTypeName: 'ADMIN',
    });

    // Customer: OTP-only — no passwordHash at all.
    const customer = await model('User').create({
      firstName: 'Otp',
      lastName: 'Customer',
      phone: CUSTOMER_PHONE,
      whatsappPhone: CUSTOMER_WHATSAPP,
      userTypeId: customerType._id,
    });
    const customerRole = await model('Role').findOne({ roleName: 'Customer' });
    if (customerRole) {
      await model('UserRole').create({
        userId: customer._id,
        roleId: customerRole._id,
      });
    }

    // Staff: password + OTP (2FA).
    const staff = await model('User').create({
      firstName: 'Otp',
      lastName: 'Staff',
      phone: STAFF_PHONE,
      whatsappPhone: `237${STAFF_PHONE}`,
      email: 'otp.staff@dressdoctor.io',
      userTypeId: adminType?._id ?? new Types.ObjectId(),
      passwordHash: await bcrypt.hash(
        STAFF_PASSWORD,
        process.env.SALT as string,
      ),
    });
    const managerRole = await model('Role').findOne({ roleName: 'Manager' });
    if (managerRole) {
      await model('UserRole').create({
        userId: staff._id,
        roleId: managerRole._id,
      });
    }
  }, 120000);

  afterAll(async () => {
    await app?.close();
    await rs?.stop();
  });

  const post = (path: string) =>
    request(app.getHttpServer()).post(path).set(apiHeaders);

  describe('customer OTP login (no password)', () => {
    let otpRef: string;
    let accessToken: string;
    let refreshToken: string;

    it('initiate-login issues an OTP addressed to whatsappPhone', async () => {
      const res = await post('/api/v1/auth/initiate-login')
        .send({ phone: CUSTOMER_PHONE, otpChannel: 'WhatsApp' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.otpRef).toBeDefined();
      otpRef = res.body.data.otpRef;

      // Channel-correct recipient: WhatsApp OTP → whatsappPhone (the old bug
      // routed every channel to email).
      const sent = outbox[outbox.length - 1];
      expect(sent.otpChannel).toBe('WhatsApp');
      expect(sent.recipients[0].address).toBe(CUSTOMER_WHATSAPP);
      expect(sent.variables.code).toMatch(/^\d{6}$/);
    });

    it('rejects a wrong code with 401 and the error envelope', async () => {
      const res = await post('/api/v1/auth/complete-login')
        .send({ identifier: CUSTOMER_PHONE, otpRef, code: '000000' })
        .expect(401);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toBeDefined();
    });

    it('complete-login with the issued code returns a token pair', async () => {
      const res = await post('/api/v1/auth/complete-login')
        .send({ identifier: CUSTOMER_PHONE, otpRef, code: lastOtpCode() })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
      accessToken = res.body.data.accessToken;
      refreshToken = res.body.data.refreshToken;
    });

    it('the issued access token authenticates GET /auth/me', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set(apiHeaders)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.user.phone).toBe(CUSTOMER_PHONE);
    });

    it('an OTP is single-use — replaying the same code is rejected', async () => {
      await post('/api/v1/auth/complete-login')
        .send({ identifier: CUSTOMER_PHONE, otpRef, code: lastOtpCode() })
        .expect(401);
    });

    it('the refresh token rotates into a fresh pair', async () => {
      const res = await post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).not.toBe(refreshToken);
    });
  });

  describe('staff 2FA login (password before OTP)', () => {
    it('rejects a staff login with no password — no OTP is issued', async () => {
      const before = outbox.length;
      const res = await post('/api/v1/auth/initiate-login')
        .send({ phone: STAFF_PHONE, otpChannel: 'Email' })
        .expect(401);

      expect(res.body.success).toBe(false);
      expect(outbox.length).toBe(before);
    });

    it('rejects a wrong password — no OTP is issued', async () => {
      const before = outbox.length;
      await post('/api/v1/auth/initiate-login')
        .send({
          phone: STAFF_PHONE,
          password: 'Wrong@12345',
          otpChannel: 'Email',
        })
        .expect(401);

      expect(outbox.length).toBe(before);
    });

    it('correct password issues an OTP to the staff email, and the code completes login', async () => {
      const res = await post('/api/v1/auth/initiate-login')
        .send({
          phone: STAFF_PHONE,
          password: STAFF_PASSWORD,
          otpChannel: 'Email',
        })
        .expect(201);

      const otpRef = res.body.data.otpRef;
      const sent = outbox[outbox.length - 1];
      expect(sent.otpChannel).toBe('Email');
      expect(sent.recipients[0].address).toBe('otp.staff@dressdoctor.io');

      const complete = await post('/api/v1/auth/complete-login')
        .send({ identifier: STAFF_PHONE, otpRef, code: lastOtpCode() })
        .expect(200);

      expect(complete.body.data.accessToken).toBeDefined();

      const me = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set(apiHeaders)
        .set('Authorization', `Bearer ${complete.body.data.accessToken}`)
        .expect(200);
      expect(me.body.data.user.phone).toBe(STAFF_PHONE);
    });
  });

  it('login for an unknown phone fails with INVALID_CREDENTIALS semantics (401)', async () => {
    const res = await post('/api/v1/auth/initiate-login')
      .send({ phone: '699999999', otpChannel: 'WhatsApp' })
      .expect(401);

    expect(res.body.success).toBe(false);
  });
});
