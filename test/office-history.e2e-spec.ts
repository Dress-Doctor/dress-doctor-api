/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-require-imports */
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Types } from 'mongoose';
import { redisTestEnv } from './redis-test-env';
import { testUserReference } from './user-reference';

/**
 * The office trail records who, not only what and why.
 *
 * `OfficeHistory` and `OfficeUserHistory` had no `changedBy` field at all, so
 * Mongoose quietly dropped the actor the hook handed it. Nothing failed and
 * nothing warned — the office history drawer simply never showed a name,
 * because the aggregation looked up an id that had never been stored.
 *
 * Against a real Mongo rather than a mock: a field missing from a schema is
 * exactly the kind of bug a fake model cannot have.
 */
describe('Office history records its actor (e2e)', () => {
  jest.setTimeout(180000);

  let moduleRef: TestingModule;
  let rs: MongoMemoryReplSet;

  const model = (name: string) => moduleRef.get(getModelToken(name));

  let officeId: Types.ObjectId;
  let actorId: Types.ObjectId;

  beforeAll(async () => {
    rs = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    Object.assign(process.env, {
      DATABASE_URL: rs.getUri('office-history-e2e'),
      ...redisTestEnv('office-history'),
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
      reference: 'UT-TEST01',
      userTypeName: 'ADMIN',
    });

    const actor = await model('User').create({
      reference: testUserReference(),
      userTypeId: userType._id,
      firstName: 'Amina',
      lastName: 'Nkeng',
      phone: '670000111',
      whatsappPhone: '237670000111',
      email: 'amina.nkeng@dressdoctor.io',
    });
    actorId = actor._id;
  });

  afterAll(async () => {
    await moduleRef?.close();
    await rs?.stop();
  });

  describe('the office itself', () => {
    it('names the actor on a create', async () => {
      const office = new (model('Office'))({
        officeCode: 'DD-TST',
        slug: 'test-branch',
        officeName: 'DD Test Branch',
        signedLink: 'http://localhost:3000/o/test-branch?sig=x&exp=1',
        address: 'Rue 1.234, Bonapriso',
        city: 'Douala',
        region: 'Littoral',
        officeTypeId: new Types.ObjectId(),
      });
      office.$locals.changedBy = actorId;
      office.$locals.reason = 'opened the branch';
      await office.save();
      officeId = office._id;

      const entry = await model('OfficeHistory').findOne({ officeId });
      expect(entry).not.toBeNull();
      expect(entry.action).toBe('CREATE');
      expect(String(entry.changedBy)).toBe(String(actorId));
      expect(entry.reason).toBe('opened the branch');
    });

    it('names the actor on an update, beside what changed', async () => {
      await model('Office').findOneAndUpdate(
        { _id: officeId },
        { $set: { address: 'Rue 5.678, Akwa' } },
        {
          context: {
            changedBy: actorId,
            reason: 'address corrected after a site visit',
          },
          returnDocument: 'after',
        },
      );

      const entry = await model('OfficeHistory')
        .findOne({ officeId, action: 'UPDATE' })
        .sort({ createdAt: -1 });

      expect(entry).not.toBeNull();
      expect(String(entry.changedBy)).toBe(String(actorId));
      expect(entry.reason).toBe('address corrected after a site visit');
      expect(entry.changedFields.address.to).toBe('Rue 5.678, Akwa');
    });

    // The drawer resolves the name with this exact lookup. Before the fix it
    // matched nothing, so the line naming the person was never rendered.
    it('joins to the account the drawer shows', async () => {
      const [row] = await model('OfficeHistory').aggregate([
        { $match: { officeId } },
        {
          $lookup: {
            as: 'changedByUser',
            from: 'user',
            localField: 'changedBy',
            foreignField: '_id',
            pipeline: [{ $project: { firstName: 1, lastName: 1 } }],
          },
        },
        {
          $unwind: { path: '$changedByUser', preserveNullAndEmptyArrays: true },
        },
        { $limit: 1 },
      ]);

      expect(row.changedByUser).toBeDefined();
      expect(row.changedByUser.firstName).toBe('Amina');
      expect(row.changedByUser.lastName).toBe('Nkeng');
    });
  });

  describe('the staff postings trail', () => {
    let officeUserId: Types.ObjectId;

    it('names the actor when somebody is posted to a branch', async () => {
      const posting = new (model('OfficeUser'))({
        officeId,
        userId: actorId,
        roleId: new Types.ObjectId(),
      });
      posting.$locals.changedBy = actorId;
      posting.$locals.reason = 'posted to the branch for the late shift';
      await posting.save();
      officeUserId = posting._id;

      const entry = await model('OfficeUserHistory').findOne({ officeUserId });
      expect(entry).not.toBeNull();
      expect(entry.action).toBe('CREATE');
      expect(String(entry.changedBy)).toBe(String(actorId));
      expect(entry.reason).toBe('posted to the branch for the late shift');
    });

    it('names the actor when a posting is revoked', async () => {
      await model('OfficeUser').findOneAndUpdate(
        { _id: officeUserId },
        { $set: { isActive: false } },
        {
          context: { changedBy: actorId, reason: 'moved to another branch' },
          returnDocument: 'after',
        },
      );

      const entry = await model('OfficeUserHistory')
        .findOne({ officeUserId, action: 'UPDATE' })
        .sort({ createdAt: -1 });

      expect(entry).not.toBeNull();
      expect(String(entry.changedBy)).toBe(String(actorId));
      expect(entry.reason).toBe('moved to another branch');
    });
  });

  // The reason the field is optional rather than required: a write with no
  // person behind it must still leave a trail. A required field would make
  // Mongoose reject the row, and the hook swallows that error — so the entry
  // would vanish silently, which is how this went unnoticed in the first place.
  it('still records an entry when no actor is supplied', async () => {
    const office = new (model('Office'))({
      officeCode: 'DD-SYS',
      slug: 'system-branch',
      officeName: 'DD System Branch',
      signedLink: 'http://localhost:3000/o/system-branch?sig=x&exp=1',
      address: 'Rue 9, Bonaberi',
      city: 'Douala',
      region: 'Littoral',
      officeTypeId: new Types.ObjectId(),
    });
    await office.save();

    const entry = await model('OfficeHistory').findOne({
      officeId: office._id,
    });
    expect(entry).not.toBeNull();
    expect(entry.action).toBe('CREATE');
    expect(entry.changedBy).toBeUndefined();
  });
});
