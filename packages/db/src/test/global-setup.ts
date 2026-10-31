import { loadTestEnv, prepareTestDatabase } from './database';

export default async function globalSetup(): Promise<void> {
  loadTestEnv();
  process.env.TEST_DATABASE_URL = await prepareTestDatabase();
}
