/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-require-imports */
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Types } from 'mongoose';
import { redisTestEnv } from './redis-test-env';
import { testUserReference } from './user-reference';

/**
 * A missing actor must never cost us the audit entry.
 *
 * `changedBy` was required on seventeen history schemas while the hook that
 * writes them swallows its own save errors by design — "the trail is an
 * observer of the write, not a participant in whether it succeeds". So a
 * write with nobody behind it produced a validation failure, one line in the
 * log, and no audit row at all. Silence, where the whole point is a record.
 *
 * The hook has always said what it wants: "A write with no actor is a seed or
 * a migration repair. Those are recorded on the history row, but they are
 * nobody's activity." These tests hold it to that.
 */
describe('History records its actor, and survives without one (e2e)', () => {
  jest.setTimeout(180000);

  let moduleRef: TestingModule;
  let rs: MongoMemoryReplSet;
  let actorId: Types.ObjectId;
  let customerTypeId: Types.ObjectId;

  const model = (name: string) => moduleRef.get(getModelToken(name));

  const newUser = (over: Record<string, unknown> = {}) => ({
    reference: testUserReference(),
    firstName: 'Ada',
    lastName: 'Mbarga',
    phone: `6${Math.floor(10000000 + Math.random() * 89999999)}`,
    userTypeId: customerTypeId,
    ...over,
  });

  beforeAll(async () => {
    rs = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    Object.assign(process.env, {
      DATABASE_URL: rs.getUri('history-actor-e2e'),
      ...redisTestEnv('history-actor'),
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

    const { SchemaModule } = require('../src/schema/schema.module');
    moduleRef = await Test.createTestingModule({
      imports: [SchemaModule],
    }).compile();
    await moduleRef.init();

    const userType = await model('UserType').create({
      reference: 'UT-HIST01',
      userTypeName: 'CUSTOMER',
    });
    customerTypeId = userType._id;

    const actor = await model('User').create(newUser({ firstName: 'Manager' }));
    actorId = actor._id;
  });

  afterAll(async () => {
    await moduleRef?.close();
    await rs?.stop();
  });

  describe('with an actor', () => {
    it('stores changedBy on a CREATE', async () => {
      const doc = new (model('User'))(newUser());
      doc.$locals.changedBy = actorId;
      doc.$locals.reason = 'registered at the counter';
      await doc.save();

      const entry = await model('UserHistory').findOne({ userId: doc._id });
      expect(entry).not.toBeNull();
      expect(entry.action).toBe('CREATE');
      expect(String(entry.changedBy)).toBe(String(actorId));
      expect(entry.reason).toBe('registered at the counter');
    });

    it('stores changedBy on an UPDATE', async () => {
      const doc = await model('User').create(newUser());

      await model('User').findOneAndUpdate(
        { _id: doc._id },
        { $set: { firstName: 'Corrected' } },
        {
          context: { changedBy: actorId, reason: 'name was misspelled' },
          returnDocument: 'after',
        },
      );

      const entry = await model('UserHistory')
        .findOne({ userId: doc._id, action: 'UPDATE' })
        .sort({ createdAt: -1 });

      expect(entry).not.toBeNull();
      expect(String(entry.changedBy)).toBe(String(actorId));
      expect(entry.changedFields.firstName.to).toBe('Corrected');
    });

    // The actor is stored as a ref, and every history read joins it to show a
    // name. That join has to keep working.
    it('still joins to the account a trail displays', async () => {
      const doc = new (model('User'))(newUser());
      doc.$locals.changedBy = actorId;
      await doc.save();

      const [row] = await model('UserHistory').aggregate([
        { $match: { userId: doc._id } },
        {
          $lookup: {
            as: 'changedByUser',
            from: 'user',
            localField: 'changedBy',
            foreignField: '_id',
            pipeline: [{ $project: { firstName: 1, reference: 1 } }],
          },
        },
        {
          $unwind: {
            path: '$changedByUser',
            preserveNullAndEmptyArrays: true,
          },
        },
      ]);

      expect(row.changedByUser).toBeDefined();
      expect(row.changedByUser.firstName).toBe('Manager');
    });
  });

  describe('with no actor', () => {
    it('still writes the history entry', async () => {
      const doc = await model('User').create(newUser());

      const entry = await model('UserHistory').findOne({ userId: doc._id });
      expect(entry).not.toBeNull();
      expect(entry.action).toBe('CREATE');
      expect(entry.changedBy).toBeUndefined();
    });

    it('does not swallow the entry on an UPDATE either', async () => {
      const doc = await model('User').create(newUser());

      await model('User').findOneAndUpdate(
        { _id: doc._id },
        { $set: { firstName: 'Renamed' } },
        { returnDocument: 'after' },
      );

      const entry = await model('UserHistory')
        .findOne({ userId: doc._id, action: 'UPDATE' })
        .sort({ createdAt: -1 });

      expect(entry).not.toBeNull();
      expect(entry.changedFields.firstName.to).toBe('Renamed');
      expect(entry.changedBy).toBeUndefined();
    });

    // The distinction the hook draws: the record still gets its entry, but
    // nothing lands in the per-actor activity trail, because nobody did it.
    it('writes no activity row, since it is nobody’s activity', async () => {
      const before = await model('Activity').countDocuments();
      await model('User').create(newUser());
      expect(await model('Activity').countDocuments()).toBe(before);
    });

    // A row that reads back with no actor must not break the join the trail
    // uses to show a name — it simply has no name to show.
    it('reads back cleanly through the actor join', async () => {
      const doc = await model('User').create(newUser());

      const [row] = await model('UserHistory').aggregate([
        { $match: { userId: doc._id } },
        {
          $lookup: {
            as: 'changedByUser',
            from: 'user',
            localField: 'changedBy',
            foreignField: '_id',
            pipeline: [{ $project: { firstName: 1 } }],
          },
        },
        {
          $unwind: {
            path: '$changedByUser',
            preserveNullAndEmptyArrays: true,
          },
        },
      ]);

      expect(row).toBeDefined();
      expect(row.action).toBe('CREATE');
      expect(row.changedByUser).toBeUndefined();
    });
  });

  // The same rule across the other trails, since they all share one hook.
  describe('every history collection behaves the same way', () => {
    it('records a customer profile with no actor behind it', async () => {
      const user = await model('User').create(newUser());
      const customer = await model('Customer').create({
        userId: user._id,
        customerCode: `CU-${Date.now().toString().slice(-6)}`,
        referralCode: `RF-${Date.now().toString().slice(-6)}`,
      });

      const entry = await model('CustomerHistory').findOne({
        customerId: customer._id,
      });
      expect(entry).not.toBeNull();
      expect(entry.action).toBe('CREATE');
    });

    it('records a setting change with no actor behind it', async () => {
      const setting = await model('Setting').create({
        key: 'historyActorProbe',
        value: 1,
        officeId: null,
      });

      const entry = await model('SettingHistory').findOne({
        settingId: setting._id,
      });
      expect(entry).not.toBeNull();
      expect(entry.action).toBe('CREATE');
    });
  });
});
