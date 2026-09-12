/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-require-imports */
import { INestApplicationContext } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { getQueueToken } from '@nestjs/bullmq';
import { Test } from '@nestjs/testing';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Types } from 'mongoose';
import { redisTestEnv } from './redis-test-env';
import { testUserReference } from './user-reference';

/**
 * Phase 2 close-out A: the live worker loop against a REAL Redis (CI service
 * container / local redis) and an ephemeral replica-set Mongo — the pieces the
 * unit suites mock. Proves, end to end in one process:
 *
 *   1. cron → Redis leader lock → queue → processor → JobRun COMPLETED
 *   2. two cron owners racing one tick → exactly one dispatch
 *   3. the reconcile watermark: run 2 carries run 1's finishedAt as `since`
 *   4. transactional dedup: a replayed payment.recorded event writes exactly
 *      one delivery-log row (console WhatsApp provider — no external calls)
 */
describe('Worker loop (e2e)', () => {
  jest.setTimeout(120000);

  let ctx: INestApplicationContext;
  let rs: MongoMemoryReplSet;

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
      DATABASE_URL: rs.getUri('worker-e2e'),
      ...redisTestEnv('worker'),
      JWT_SECRET: 'e2e-secret-min-16-chars',
      JWT_ACCESS_TTL: '15m',
      SALT: '$2b$10$C6UzMDM.H6dfI/f/IKcEeO',
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
    // require after env so BullModule.forRoot + config validation see it.
    const { WorkerModule } = require('../src/worker.module');
    const moduleRef = await Test.createTestingModule({
      imports: [WorkerModule],
    }).compile();
    ctx = await moduleRef.init();

    // Console WhatsApp provider — sends logged, never real. Stripped AFTER
    // boot because ConfigModule's dotenv load would repopulate them from a
    // local .env during init; the provider reads env at send time.
    delete process.env.WHATSAPP_API_URL;
    delete process.env.WHATSAPP_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER;
  });

  afterAll(async () => {
    // Drain Bull connections before killing Mongo so shutdown doesn't hang.
    await ctx?.close();
    await rs?.stop();
  });

  const model = (name: string) =>
    ctx.get(getModelToken(name), { strict: false });

  it('cron tick → leader lock → queue → processor → JobRun COMPLETED (reconcile corrects drift)', async () => {
    const {
      ScheduledJobsCron,
    } = require('../src/scheduler/scheduled-jobs.cron');
    const cron = ctx.get(ScheduledJobsCron, { strict: false });

    // Seed a drifted order + a payment inside the scan window: fully paid but
    // still stored as PARTIAL+flagged. The reconcile must correct it to the
    // synchronous answer (PAID, not flagged).
    const orderStatusModel = model('OrderStatus');
    const ready =
      (await orderStatusModel.findOne({ orderStatusName: 'READY' })) ??
      (await orderStatusModel.create({
        // Lookup rows are addressed by reference since 7f908e2, and the field
        // is required — a fixture has to state one the way a seed does.
        reference: 'OS-READY',
        orderStatusName: 'READY',
        isActive: true,
      }));
    const currencyModel = model('Currency');
    const currency =
      (await currencyModel.findOne({ isoCode: 'XAF' })) ??
      (await currencyModel.create({
        // Same reason as the status above: `reference` is required on every
        // lookup row since 7f908e2, so a fixture has to state one.
        reference: 'CY-XAF',
        isoCode: 'XAF',
        countryName: 'Cameroon',
        name: 'Central African CFA Franc',
        symbol: 'FCFA',
        numericCode: 950,
        isActive: true,
      }));

    const userId = new Types.ObjectId();
    const order = await model('Order').create({
      customerId: userId,
      currencyId: currency._id,
      orderCode: `OR-E2E-${Date.now()}`,
      totalAmount: 1000,
      amountPaid: 1000,
      balanceDue: 0,
      paymentStatus: 'PARTIAL', // drifted
      flagged: true, // drifted
      estimatedDeliveryDate: new Date(),
      orderStatusId: ready._id,
      createdBy: userId,
      pickedUpBy: userId,
    });
    await model('Payment').create({
      reference: 'PY-TEST01',
      orderId: order._id,
      amount: 1000,
      paidAt: new Date(),
      currencyId: currency._id,
      paymentTypeId: new Types.ObjectId(),
      paymentMethodId: new Types.ObjectId(),
      receivedBy: userId,
    });

    await cron.paymentReconcile();

    const jobRunModel = model('JobRun');
    await waitFor(async () => {
      const run = await jobRunModel.findOne({ queue: 'payment-reconcile' });
      return run?.status === 'COMPLETED';
    });

    const run = await jobRunModel.findOne({ queue: 'payment-reconcile' });
    expect(run.status).toBe('COMPLETED');
    expect(run.leaderId).toBeTruthy();
    expect(run.counts.changed).toBe(1);

    const corrected = await model('Order').findById(order._id);
    expect(corrected.paymentStatus).toBe('PAID');
    expect(corrected.flagged).toBe(false);
  });

  it('carries the watermark: the next dispatch has since = last COMPLETED finishedAt', async () => {
    const {
      ScheduledJobsCron,
    } = require('../src/scheduler/scheduled-jobs.cron');
    const {
      LeaderLockService,
    } = require('../src/helper/service/leader-lock.service');
    const { JobRunService } = require('../src/helper/service/job-run.service');
    const {
      ScheduledJobProducer,
    } = require('../src/queue/producer/scheduled-job.producer');
    const { REDIS_CLIENT } = require('../src/helper/redis/redis.module');

    const jobRunModel = model('JobRun');
    const first = await jobRunModel
      .findOne({ queue: 'payment-reconcile', status: 'COMPLETED' })
      .sort({ finishedAt: -1 });
    expect(first).toBeTruthy();

    // The 5-min leader lock from the previous tick is still held — a fresh
    // cron instance must first fail, which is itself the single-owner proof
    // across processes. Release it, then dispatch again.
    const redis = ctx.get(REDIS_CLIENT, { strict: false });
    const jobRun = ctx.get(JobRunService, { strict: false });
    const producer = ctx.get(ScheduledJobProducer, { strict: false });
    const blockedCron = new ScheduledJobsCron(
      new LeaderLockService(redis),
      jobRun,
      producer,
    );
    await blockedCron.paymentReconcile();
    expect(
      await jobRunModel.countDocuments({ queue: 'payment-reconcile' }),
    ).toBe(1);

    await redis.del('cron:payment-reconcile');
    const cron2 = new ScheduledJobsCron(
      new LeaderLockService(redis),
      jobRun,
      producer,
    );
    await cron2.paymentReconcile();

    const second = await jobRunModel
      .findOne({ queue: 'payment-reconcile', status: { $ne: null } })
      .sort({ dispatchedAt: -1 });
    expect(second.jobId).not.toBe(first.jobId);

    // The enqueued job carries the first run's finishedAt as the watermark.
    const { Queues } = require('../src/queue/queue.dto');
    const queue = ctx.get(getQueueToken(Queues.paymentReconcile), {
      strict: false,
    });
    const job = await queue.getJob(second.jobId);
    expect(job.data.since).toBe(first.finishedAt.toISOString());

    await waitFor(async () => {
      const run = await jobRunModel.findById(second._id);
      return run?.status === 'COMPLETED';
    });
    // Idempotent: nothing left to correct.
    const run = await jobRunModel.findById(second._id);
    expect(run.counts.changed).toBe(0);
  });

  it('two workers racing one tick → exactly one dispatch', async () => {
    const {
      ScheduledJobsCron,
    } = require('../src/scheduler/scheduled-jobs.cron');
    const {
      LeaderLockService,
    } = require('../src/helper/service/leader-lock.service');
    const { JobRunService } = require('../src/helper/service/job-run.service');
    const {
      ScheduledJobProducer,
    } = require('../src/queue/producer/scheduled-job.producer');
    const { REDIS_CLIENT } = require('../src/helper/redis/redis.module');

    const redis = ctx.get(REDIS_CLIENT, { strict: false });
    await redis.del('cron:inactivity-scan');

    const jobRun = ctx.get(JobRunService, { strict: false });
    const producer = ctx.get(ScheduledJobProducer, { strict: false });
    // Two distinct "workers": separate lock instances (unique instance ids)
    // against the same real Redis.
    const workerA = new ScheduledJobsCron(
      new LeaderLockService(redis),
      jobRun,
      producer,
    );
    const workerB = new ScheduledJobsCron(
      new LeaderLockService(redis),
      jobRun,
      producer,
    );

    await Promise.all([workerA.inactivityScan(), workerB.inactivityScan()]);

    const jobRunModel = model('JobRun');
    expect(await jobRunModel.countDocuments({ queue: 'inactivity-scan' })).toBe(
      1,
    );
  });

  it('transactional dedup: replayed payment.recorded writes exactly one delivery-log row', async () => {
    const {
      TransactionalMessageListener,
    } = require('../src/events/transactional-message.listener');
    const {
      NotificationService,
    } = require('../src/helper/service/notification.service');

    // The worker context doesn't run the seeder — seed the WhatsApp template
    // the receipt needs.
    await model('NotificationTemplate').create({
      templateName: 'payment_receipt',
      channel: 'WhatsApp',
      titleFr: 'Reçu de paiement',
      titleEn: 'Payment receipt',
      variables: ['firstName', 'orderCode', 'amount', 'balance'],
    });

    const userTypeModel = model('UserType');
    const customerType =
      (await userTypeModel.findOne({ userTypeName: 'CUSTOMER' })) ??
      (await userTypeModel.create({
        reference: 'UT-CUSTOMER',
        userTypeName: 'CUSTOMER',
      }));
    const user = await model('User').create({
      reference: testUserReference(),
      firstName: 'Marie',
      phone: '690000001',
      whatsappPhone: '237690000001',
      userTypeId: customerType._id,
      preferredLanguage: 'fr',
    });
    await model('Customer').create({
      userId: user._id,
      customerCode: 'CU-E2E-1',
      referralCode: 'REF-E2E-1',
      notificationsOptIn: true,
    });
    const order = await model('Order').findOne({});

    const listener = new TransactionalMessageListener(
      model('Order'),
      model('Customer'),
      model('User'),
      model('Notification'),
      ctx.get(NotificationService, { strict: false }),
    );
    // Point the order at this customer for the receipt context.
    await model('Order').updateOne(
      { _id: order._id },
      { $set: { customerId: user._id } },
    );

    const event = {
      paymentId: new Types.ObjectId(),
      orderId: order._id,
      amount: 1000,
      isRefund: false,
    };
    const dedupKey = `payment-receipt:${event.paymentId.toString()}`;

    // First emission → queue → processor → console WhatsApp → delivery log.
    await listener.onPaymentRecorded(event);
    const notificationModel = model('Notification');
    await waitFor(async () =>
      Boolean(await notificationModel.findOne({ dedupKey })),
    );

    // Replay (duplicate event / job retry after success) → durable no-op.
    await listener.onPaymentRecorded(event);
    await new Promise((r) => setTimeout(r, 2000));

    expect(await notificationModel.countDocuments({ dedupKey })).toBe(1);
  });
});
