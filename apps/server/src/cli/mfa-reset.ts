import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { createPrismaClient, type PrismaClient } from '@redova/db';
import { loadDotEnv } from '../config/env';

export interface MfaResetInput {
  email: string;
  reason: string;
}

/**
 * Removes every second factor of a user who lost them all, and signs them out everywhere
 * (README §7, runbook docs/user-management/runbooks/mfa-reset.md). One transaction, audited.
 */
export const resetMfa = async (
  prisma: PrismaClient,
  { email, reason }: MfaResetInput,
): Promise<{ userId: string; sessionsRevoked: number }> => {
  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { id: true },
  });
  if (!user) throw new Error(`No user with email ${email}`);

  const sessionsRevoked = await prisma.$transaction(async (tx) => {
    await tx.twoFactor.deleteMany({ where: { userId: user.id } });
    await tx.user.update({ where: { id: user.id }, data: { twoFactorEnabled: false } });
    const { count } = await tx.session.deleteMany({ where: { userId: user.id } });
    await tx.auditEvent.create({
      data: {
        action: 'admin.user.mfa_reset',
        outcome: 'SUCCESS',
        actorType: 'SYSTEM',
        targetType: 'USER',
        targetId: user.id,
        metadata: { reason, sessionsRevoked: count },
      },
    });
    return count;
  });
  return { userId: user.id, sessionsRevoked };
};

const USAGE = 'Usage: mfa:reset --email <email> --reason "<identity verification summary>"';

const main = async (): Promise<number> => {
  const { values } = parseArgs({
    options: { email: { type: 'string' }, reason: { type: 'string' } },
  });
  const email = values.email?.trim();
  const reason = values.reason?.trim();
  if (!email || !reason) {
    console.error(USAGE);
    return 1;
  }

  loadDotEnv();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is not set.');
    return 1;
  }

  // The operator retypes the email: a wrong or missing answer changes nothing.
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await prompt
    .question(
      `This removes all second factors of ${email} and revokes every session.\nType the email again to confirm: `,
    )
    .catch(() => '');
  prompt.close();
  if (answer.trim().toLowerCase() !== email.toLowerCase()) {
    console.error('Confirmation did not match. Nothing was changed.');
    return 1;
  }

  const prisma = createPrismaClient(databaseUrl);
  try {
    const result = await resetMfa(prisma, { email, reason });
    console.log(
      `MFA reset for user ${result.userId}; ${result.sessionsRevoked} session(s) revoked.`,
    );
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return 1;
  } finally {
    await prisma.$disconnect();
  }
};

if (require.main === module) {
  void main().then((code) => {
    process.exitCode = code;
  });
}
