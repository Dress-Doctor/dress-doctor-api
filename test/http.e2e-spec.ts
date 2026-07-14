/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-require-imports */
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
      .get('/api/v1/order')
      .expect(401);

    expect(res.body.success).toBe(false);
    expect(res.body.error?.code).toBeDefined();
    expect(res.body.timestamp).toBeDefined();
  });

  it('with a valid api-key but no JWT, fails at gate 2 (guard ordering)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/order')
      .set(apiHeaders)
      .expect(401);

    expect(res.body.success).toBe(false);
  });

  it('an authenticated admin gets the success envelope + pagination', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/order')
      .set(apiHeaders)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    // list contract: total + data + nextPage
    expect(res.body.data).toBeDefined();
    expect(res.body).toHaveProperty('total');
  });
});
