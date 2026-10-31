const { loadTestEnv, prepareTestDatabase } = require('@redova/db/testing');

module.exports = async () => {
  loadTestEnv();
  // Separate from development, Vitest integration and the existing E2E databases.
  const database = new URL(process.env.DATABASE_URL);
  database.pathname = `${database.pathname}_jest_test`;
  process.env.TEST_DATABASE_URL = database.toString();
  process.env.TEST_DATABASE_URL = await prepareTestDatabase();
};
