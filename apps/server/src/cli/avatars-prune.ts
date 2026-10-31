import { parseArgs } from 'node:util';
import { createPrismaClient } from '@redova/db';
import { loadDotEnv, parseEnv } from '../config/env';
import { pruneAvatars } from '../storage/prune-avatars';
import { createAvatarStorage } from '../storage/storage.module';

const main = async (): Promise<void> => {
  const { values } = parseArgs({ options: { apply: { type: 'boolean', default: false } } });
  loadDotEnv();
  const env = parseEnv(process.env);
  const prisma = createPrismaClient(env.DATABASE_URL);
  const storage = createAvatarStorage(env);
  try {
    console.log(
      JSON.stringify({
        dryRun: !values.apply,
        ...(await pruneAvatars(storage, prisma, { apply: values.apply })),
      }),
    );
  } finally {
    storage.destroy?.();
    await prisma.$disconnect();
  }
};

if (require.main === module) {
  void main().catch(() => {
    console.error('Avatar cleanup failed. Verify database/storage configuration and connectivity.');
    process.exitCode = 1;
  });
}
