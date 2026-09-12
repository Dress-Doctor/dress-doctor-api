/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-require-imports */
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { redisTestEnv } from './redis-test-env';

/**
 * What the seeder promises.
 *
 * One sentence covers all of it: **the seed creates a row, and a person owns
 * it from then on.** Everything below is that sentence, checked.
 *
 * Run against a real in-memory Mongo rather than mocks on purpose — the two
 * things most likely to break are the history hooks and the `updatedAt`
 * behaviour, and neither shows up against a fake model.
 */
describe('Seeding (e2e)', () => {
  jest.setTimeout(180000);

  let moduleRef: TestingModule;
  let rs: MongoMemoryReplSet;

  const model = (name: string) => moduleRef.get(getModelToken(name));
  const seed = () => moduleRef.get(SeederService).run();

  let SeederService: any;

  beforeAll(async () => {
    rs = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    Object.assign(process.env, {
      DATABASE_URL: rs.getUri('seeder-e2e'),
      ...redisTestEnv('seeder'),
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

    const { RedisModule } = require('../src/helper/redis/redis.module');
    const {
      CodeGeneratorService,
    } = require('../src/helper/service/code-generator.service');
    const {
      LeaderLockService,
    } = require('../src/helper/service/leader-lock.service');
    const { SchemaModule } = require('../src/schema/schema.module');
    SeederService =
      require('../src/helper/service/seeder.service').SeederService;

    moduleRef = await Test.createTestingModule({
      imports: [SchemaModule, RedisModule],
      providers: [CodeGeneratorService, LeaderLockService, SeederService],
    }).compile();
    await moduleRef.init();
  });

  afterAll(async () => {
    await moduleRef?.close();
    await rs?.stop();
  });

  describe('the first run', () => {
    beforeAll(async () => {
      await seed();
    });

    it('creates the reference rows, the catalogue and the roles', async () => {
      expect(
        await model('UserType').countDocuments({ userTypeName: 'ADMIN' }),
      ).toBe(1);
      expect(await model('OrderStatus').countDocuments()).toBeGreaterThan(0);
      expect(await model('Category').countDocuments()).toBeGreaterThan(0);
      expect(await model('Item').countDocuments()).toBeGreaterThan(0);
      expect(await model('Role').countDocuments()).toBeGreaterThan(0);
    });

    /*
     * The rule, checked across everything the seeder creates: a record that
     * needs a reference has one from the moment it exists, and no two rows
     * share it.
     *
     * Roles are the reason this is a sweep rather than a spot check. The old
     * seeder minted references for every other collection and forgot roles, so
     * a fresh database produced roles the panel could not open until somebody
     * ran a backfill command by hand.
     */
    it.each([
      'Role',
      'User',
      'UserType',
      'OfficeType',
      'OrderStatus',
      'PickupStatus',
      'PaymentMethod',
      'PaymentType',
      'Currency',
      'Category',
      'SubCategory',
      'Service',
      'ServiceType',
      'Item',
    ])('gives every %s row a unique reference', async (name) => {
      const rows = await model(name).find().select('reference');
      expect(rows.length).toBeGreaterThan(0);

      const references = rows.map((r: any) => r.reference);
      expect(references.every((r: string) => typeof r === 'string' && r)).toBe(
        true,
      );
      expect(new Set(references).size).toBe(references.length);
    });

    // The account every seeded history entry is attributed to. It used to be
    // created without one, so the staff screen could not address it.
    it('gives the bootstrap admin a reference', async () => {
      const admin = await model('User').findOne({
        email: 'fedjio.raymond@dressdoctor.io',
      });
      expect(admin).not.toBeNull();
      expect(admin.reference).toEqual(expect.any(String));
      expect(admin.reference.length).toBeGreaterThan(0);
    });

    // The account cannot exist before the rows it needs, so the run decides
    // its id up front and creates it later. Without that, the first run's
    // history entries failed validation and were silently dropped.
    it('signs its history with an account that really exists', async () => {
      const entry = await model('CategoryHistory').findOne();
      expect(entry.changedBy).toBeTruthy();

      const admin = await model('User').findById(entry.changedBy);
      expect(admin).not.toBeNull();
      expect(admin.email).toBe('fedjio.raymond@dressdoctor.io');
    });

    it('writes a history entry for what it created', async () => {
      const category = await model('Category').findOne({ seedKey: 'men' });
      const entries = await model('CategoryHistory').find({
        categoryId: category._id,
      });

      expect(entries).toHaveLength(1);
      expect(entries[0].action).toBe('CREATE');
      // The trail has to say why, even when nobody typed the reason.
      expect(entries[0].reason).toEqual(expect.stringContaining('seed'));
    });
  });

  describe('running it again', () => {
    it('creates no duplicates', async () => {
      const before = await Promise.all([
        model('Category').countDocuments(),
        model('Item').countDocuments(),
        model('Role').countDocuments(),
        model('OrderStatus').countDocuments(),
        model('Office').countDocuments(),
      ]);

      await seed();

      const after = await Promise.all([
        model('Category').countDocuments(),
        model('Item').countDocuments(),
        model('Role').countDocuments(),
        model('OrderStatus').countDocuments(),
        model('Office').countDocuments(),
      ]);

      expect(after).toEqual(before);
    });

    // The bug this replaces: every restart wrote the same values back over
    // themselves, which moved `updatedAt` and made every row look edited today.
    it('does not touch a row it has nothing to say about', async () => {
      const before = await model('Category').findOne({ seedKey: 'men' });
      const historyBefore = await model('CategoryHistory').countDocuments({
        categoryId: before._id,
      });

      await seed();

      const after = await model('Category').findOne({ seedKey: 'men' });
      expect(+after.updatedAt).toBe(+before.updatedAt);

      const historyAfter = await model('CategoryHistory').countDocuments({
        categoryId: before._id,
      });
      expect(historyAfter).toBe(historyBefore);
    });
  });

  describe('after somebody has edited a seeded row', () => {
    it('does not put a renamed category back, or add a second one', async () => {
      const total = await model('Category').countDocuments();
      await model('Category').findOneAndUpdate(
        { seedKey: 'women' },
        { $set: { categoryName: 'Ladies' } },
      );

      await seed();

      const renamed = await model('Category').findOne({ seedKey: 'women' });
      expect(renamed.categoryName).toBe('Ladies');
      // The old seeder keyed on the name, so this is where a second "Women"
      // appeared.
      expect(
        await model('Category').countDocuments({ categoryName: 'Women' }),
      ).toBe(0);
      expect(await model('Category').countDocuments()).toBe(total);
    });

    it('leaves a reworded description alone', async () => {
      const mine = 'Anything a man would wear. Reworded by the office.';
      await model('Category').findOneAndUpdate(
        { seedKey: 'men' },
        { $set: { description: mine } },
      );

      await seed();

      const after = await model('Category').findOne({ seedKey: 'men' });
      expect(after.description).toBe(mine);
    });

    it('leaves a corrected price alone', async () => {
      const item = await model('Item').findOne({ seedKey: 'men-tops-t-shirt' });
      const admin = await model('User').findOne().select('_id');
      // Edited the way the panel edits: with a real actor and a reason, so
      // the row carries a genuine history entry the seed must not undo.
      await model('Item').findOneAndUpdate(
        { _id: item._id },
        { $set: { priceLow: 1234, priceHigh: 5678 } },
        {
          context: {
            changedBy: admin._id,
            reason: 'corrected the list price after a supplier change',
          },
        },
      );

      await seed();

      const after = await model('Item').findOne({
        seedKey: 'men-tops-t-shirt',
      });
      expect(after.priceLow).toBe(1234);
      expect(after.priceHigh).toBe(5678);
    });

    it('leaves a switched-off row switched off', async () => {
      await model('OrderStatus').findOneAndUpdate(
        { orderStatusName: 'RECEIVED' },
        { $set: { isActive: false } },
      );

      await seed();

      const after = await model('OrderStatus').findOne({
        orderStatusName: 'RECEIVED',
      });
      expect(after.isActive).toBe(false);
    });

    it('leaves a reworded reference description alone', async () => {
      const mine = 'The garments are with us and counted.';
      await model('OrderStatus').findOneAndUpdate(
        { orderStatusName: 'RECEIVED' },
        { $set: { description: mine } },
      );

      await seed();

      const after = await model('OrderStatus').findOne({
        orderStatusName: 'RECEIVED',
      });
      expect(after.description).toBe(mine);
    });
  });

  describe('what each role may do', () => {
    const rowsFor = async (seedKey: string) => {
      const role = await model('Role').findOne({ seedKey });
      return model('RolePermission').find({ roleId: role._id });
    };

    it('scopes an office role to its own branch', async () => {
      const rows = await rowsFor('office-manager');
      const scoped = rows.filter((r: any) => r.conditions);
      expect(scoped.length).toBeGreaterThan(0);
      for (const row of scoped) {
        expect(row.conditions).toEqual({ officeId: '$office' });
      }
    });

    // The bug: a condition was only ever written, never removed. A role moved
    // from one branch to everywhere kept the old limit and went on seeing one
    // branch.
    it('removes a condition that no longer applies', async () => {
      const role = await model('Role').findOne({ seedKey: 'manager' });
      const row = await model('RolePermission').findOne({ roleId: role._id });
      await model('RolePermission').findOneAndUpdate(
        { _id: row._id },
        { $set: { conditions: { officeId: '$office' }, scope: 'OFFICE' } },
      );

      await seed();

      const after = await model('RolePermission').findOne({ _id: row._id });
      expect(after.conditions ?? null).toBeNull();
      expect(after.scope).toBe('GLOBAL');
    });

    it('leaves a matrix edit alone, because it is additive by default', async () => {
      const role = await model('Role').findOne({ seedKey: 'cashier' });
      const extra = await model('Permission').findOne({
        action: 'READ',
        subject: 'Office',
      });
      await model('RolePermission').create({
        roleId: role._id,
        permissionId: extra._id,
        scope: 'GLOBAL',
      });

      await seed();

      const still = await model('RolePermission').findOne({
        roleId: role._id,
        permissionId: extra._id,
      });
      expect(still).not.toBeNull();
    });

    it('removes what the map no longer lists, but only when told to', async () => {
      const role = await model('Role').findOne({ seedKey: 'driver' });
      const extra = await model('Permission').findOne({
        action: 'DELETE',
        subject: 'Currency',
      });
      await model('RolePermission').create({
        roleId: role._id,
        permissionId: extra._id,
        scope: 'GLOBAL',
      });

      process.env.SEED_RECONCILE_PERMISSIONS = 'YES';
      try {
        await seed();
      } finally {
        delete process.env.SEED_RECONCILE_PERMISSIONS;
      }

      const gone = await model('RolePermission').findOne({
        roleId: role._id,
        permissionId: extra._id,
      });
      expect(gone).toBeNull();
    });
  });

  describe('the API client', () => {
    it('keeps the secret out of the log', () => {
      const {
        SeederService: Klass,
      } = require('../src/helper/service/seeder.service');
      const source = Klass.prototype.seedSystemApiClient.toString();
      // The secret is shown once on stdout and never handed to the logger,
      // which writes to a file that outlives the deploy.
      expect(source).not.toMatch(/logger\.log\([^)]*secret/);
    });
  });
});
