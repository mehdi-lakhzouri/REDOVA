import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { Client } from 'pg';

/** Loads the shared root .env (local development); CI injects variables directly. */
export const loadTestEnv = (): void => {
  config({ path: resolve(__dirname, '../../../../.env'), quiet: true });
};

/** Integration tests never touch the development database: they use `<db>_test` on the same server. */
export const getTestDatabaseUrl = (): string => {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const base = process.env.DATABASE_URL;
  if (!base)
    throw new Error('DATABASE_URL (or TEST_DATABASE_URL) must be set for integration tests');
  const url = new URL(base);
  url.pathname = `${url.pathname.replace(/^\//, '')}_test`;
  return url.toString();
};

/** Creates the test database if needed and applies all migrations to it. */
export const prepareTestDatabase = async (): Promise<string> => {
  const testUrl = getTestDatabaseUrl();
  const target = new URL(testUrl);
  const dbName = target.pathname.replace(/^\//, '');
  const admin = new URL(testUrl);
  admin.pathname = '/postgres';

  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (exists.rowCount === 0) await client.query(`CREATE DATABASE "${dbName.replace(/"/g, '')}"`);
  } finally {
    await client.end();
  }

  const dbPackageRoot = resolve(__dirname, '../../');
  execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'], {
    cwd: dbPackageRoot,
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: 'pipe',
  });
  return testUrl;
};
