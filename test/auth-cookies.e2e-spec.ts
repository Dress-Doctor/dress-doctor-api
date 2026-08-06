/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-require-imports */
import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Types } from 'mongoose';
import request from 'supertest';

/**
 * The browser session contract: tokens must arrive as HttpOnly cookies and be
 * accepted back from them, because the admin panel holds no token in JS.
 *
 * These are the guarantees the frontend's SSR guard depends on — if any of
 * them regress, a hard reload silently logs every staff user out.
 */
describe('cookie session (e2e)', () => {
  let app: INestApplication;
  let rs: MongoMemoryReplSet;
  const apiHeaders = { 'x-api-key': 'e2e-key', 'x-api-secret': 'e2e-secret' };

  const outbox: Array<{ variables: Record<string, string> }> = [];
  const lastOtpCode = () => outbox[outbox.length - 1]?.variables?.code;

  const STAFF_EMAIL = 'cookie.staff@dressdoctor.io';
  const STAFF_PHONE = '677000009';
  const STAFF_PASSWORD = 'Staff@12345';

  /** supertest exposes set-cookie as a raw header array. */
  const cookiesFrom = (res: request.Response): string[] => {
    const raw = res.headers['set-cookie'];
    return Array.isArray(raw) ? raw : raw ? [raw] : [];
  };

  const cookieNamed = (res: request.Response, name: string) =>
    cookiesFrom(res).find((cookie) => cookie.startsWith(`${name}=`));

  /** `name=value` pairs only — what a browser would send back. */
  const cookieHeader = (res: request.Response) =>
    cookiesFrom(res)
      .map((cookie) => cookie.split(';')[0])
      .join('; ');

  beforeAll(async () => {
    rs = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    Object.assign(process.env, {
      DATABASE_URL: rs.getUri('test'),
      REDIS_HOST: process.env.REDIS_HOST ?? '127.0.0.1',
      REDIS_PORT: process.env.REDIS_PORT ?? '6379',
      REDIS_NAME: 'e2e-cookies',
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
    const { configureApp } = require('../src/config/app-setup');
    const {
      NotificationService,
    } = require('../src/helper/service/notification.service');

    jest
      .spyOn(NotificationService.prototype, 'addToQueue')
      .mockImplementation((payload: unknown) => {
        outbox.push(payload as (typeof outbox)[number]);
        return Promise.resolve();
      });

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = configureApp(moduleRef.createNestApplication());
    await app.init();

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
    const adminType = await model('UserType').findOne({
      userTypeName: 'ADMIN',
    });
    const staff = await model('User').create({
      firstName: 'Cookie',
      lastName: 'Staff',
      phone: STAFF_PHONE,
      whatsappPhone: `237${STAFF_PHONE}`,
      email: STAFF_EMAIL,
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

  /**
   * One login for the whole file: OtpService allows three OTP requests per
   * identifier before a cool-down, so a login per test would trip its own
   * abuse protection. The session is then carried forward as it rotates.
   */
  let session: request.Response;

  beforeAll(async () => {
    const initiated = await post('/api/v1/auth/initiate-login')
      .send({ identifier: STAFF_EMAIL, password: STAFF_PASSWORD })
      .expect(201);

    session = await post('/api/v1/auth/complete-login')
      .send({
        identifier: STAFF_EMAIL,
        otpRef: initiated.body.data.otpRef,
        code: lastOtpCode(),
      })
      .expect(200);
  }, 60000);

  it('sets HttpOnly access and refresh cookies on complete-login', () => {
    const access = cookieNamed(session, 'dd_at');
    const refresh = cookieNamed(session, 'dd_rt');

    expect(access).toBeDefined();
    expect(refresh).toBeDefined();
    expect(access).toContain('HttpOnly');
    expect(refresh).toContain('HttpOnly');
    expect(access).toContain('SameSite=Lax');
    expect(refresh).toContain('SameSite=Lax');
    // Path-wide on purpose: the admin renders server-side, and its document
    // request must carry the refresh cookie for a mid-render rotation.
    expect(refresh).toContain('Path=/');
  });

  it('authenticates /me from the cookie with no Authorization header', async () => {
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set(apiHeaders)
      .set('Cookie', cookieHeader(session))
      .expect(200);

    expect(me.body.data.user.email).toBe(STAFF_EMAIL);
  });

  it('rejects /me when no cookie and no bearer token are present', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set(apiHeaders)
      .expect(401);
  });

  it('refuses a refresh with neither body nor cookie', async () => {
    await post('/api/v1/auth/refresh').send({}).expect(401);
  });

  // The rotation tests run in order: each consumes the session the previous
  // one issued, which is exactly how a browser uses them.
  it('rotates the session from the refresh cookie with an empty body', async () => {
    const before = cookieNamed(session, 'dd_rt');

    const rotated = await post('/api/v1/auth/refresh')
      .set('Cookie', cookieHeader(session))
      .send({})
      .expect(200);

    expect(cookieNamed(rotated, 'dd_at')).toBeDefined();
    // The access cookie is a JWT and can be byte-identical when reissued in
    // the same second; the opaque refresh token is what must always rotate.
    expect(cookieNamed(rotated, 'dd_rt')).toBeDefined();
    expect(cookieNamed(rotated, 'dd_rt')).not.toBe(before);

    session = rotated;
  });

  it('still accepts a refresh token supplied in the body (service clients)', async () => {
    const rotated = await post('/api/v1/auth/refresh')
      .send({ refreshToken: session.body.data.refreshToken })
      .expect(200);

    session = rotated;
  });

  it('clears both cookies on logout', async () => {
    const out = await post('/api/v1/auth/logout')
      .set('Cookie', cookieHeader(session))
      .send({})
      .expect(200);

    // An expiry in the past is how a Set-Cookie deletes.
    expect(cookieNamed(out, 'dd_at')).toContain('Expires=Thu, 01 Jan 1970');
    expect(cookieNamed(out, 'dd_rt')).toContain('Expires=Thu, 01 Jan 1970');
  });
});
