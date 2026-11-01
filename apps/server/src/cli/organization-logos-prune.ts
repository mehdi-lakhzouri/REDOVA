import { parseArgs } from 'node:util';
import { createPrismaClient } from '@redova/db';
import { loadDotEnv, parseEnv } from '../config/env';
import { pruneOrganizationLogos } from '../storage/prune-organization-logos';
import { createOrganizationLogoStorage } from '../storage/storage.module';

async function main() {
  const { values } = parseArgs({ options: { apply: { type: 'boolean', default: false } } });
  loadDotEnv();
  const env = parseEnv(process.env);
  const prisma = createPrismaClient(env.DATABASE_URL);
  const storage = createOrganizationLogoStorage(env);
  try {
    console.log(
      JSON.stringify({
        dryRun: !values.apply,
        ...(await pruneOrganizationLogos(storage, prisma, { apply: values.apply })),
      }),
    );
  } finally {
    storage.destroy?.();
    await prisma.$disconnect();
  }
}
if (require.main === module)
  void main().catch(() => {
    console.error('Organization logo cleanup failed. Verify database/storage configuration.');
    process.exitCode = 1;
  });
