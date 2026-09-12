import { productionRefusal } from './refuse-production';

/**
 * `npm run seed:test` invents customers, orders and payments. On a live
 * database that is fake trade sitting in the books, and nothing about the rows
 * says they were made up. So it has to refuse.
 */
describe('productionRefusal', () => {
  const dev = { DATABASE_URL: 'mongodb://localhost:27017/dressdoctor-dev' };

  it('lets a local database through', () => {
    expect(productionRefusal(dev)).toBeNull();
  });

  it('refuses when NODE_ENV says production', () => {
    expect(productionRefusal({ ...dev, NODE_ENV: 'production' })).toContain(
      'NODE_ENV',
    );
    expect(productionRefusal({ ...dev, NODE_ENV: 'prod' })).toContain(
      'NODE_ENV',
    );
  });

  // The likelier accident: NODE_ENV unset on a laptop, DATABASE_URL pointing
  // somewhere it should not.
  it('refuses when the database name reads like a live one', () => {
    for (const name of ['dressdoctor-prod', 'dd_production', 'live-db']) {
      const refusal = productionRefusal({
        DATABASE_URL: `mongodb+srv://user:pw@cluster.mongodb.net/${name}`,
      });
      expect(refusal).toContain(name);
    }
  });

  it('reads the name past a query string', () => {
    expect(
      productionRefusal({
        DATABASE_URL:
          'mongodb+srv://user:pw@cluster.mongodb.net/dd-prod?retryWrites=true',
      }),
    ).toContain('dd-prod');
  });

  it('is not fooled by "prod" elsewhere in the connection string', () => {
    expect(
      productionRefusal({
        DATABASE_URL: 'mongodb://prod-host.internal:27017/dressdoctor-test',
      }),
    ).toBeNull();
  });

  it('gives way to an explicit override', () => {
    expect(
      productionRefusal({
        NODE_ENV: 'production',
        DATABASE_URL: 'mongodb://localhost:27017/dd-prod',
        ALLOW_TEST_SEED: 'YES',
      }),
    ).toBeNull();
  });
});
