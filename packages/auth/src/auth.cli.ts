// Entry point for the Better Auth CLI (`pnpm auth:generate`) only — never imported at runtime.
import { createPrismaClient } from '@redova/db';
import { createAuth } from './create-auth';

export const auth = createAuth({
  prisma: createPrismaClient(
    process.env.DATABASE_URL ?? 'postgresql://placeholder@localhost:5432/placeholder',
  ),
  enqueueEmail: async () => undefined,
  recordAudit: async () => undefined,
  secret: 'better-auth-cli-schema-generation-only-0000',
  baseURL: 'http://localhost:3001',
  webOrigin: 'http://localhost:3000',
  production: false,
  hibpEnabled: false,
  rateLimitEnabled: false,
});
