import type { PrismaClient } from '../generated/prisma/client';

export * from './database';

/** Truncates every application table (keeps Prisma's migration history). Test environments only. */
export const resetDatabase = async (prisma: PrismaClient): Promise<void> => {
  if (process.env.NODE_ENV === 'production')
    throw new Error('resetDatabase must never run in production');
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (rows.length === 0) return;
  const tables = rows.map(({ tablename }) => `"public"."${tablename}"`).join(', ');
  // The audit trigger blocks DELETE/UPDATE only; TRUNCATE is allowed for test resets.
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
};
