import { parseArgs } from 'node:util';
import { createPrismaClient, type PrismaClient } from '@redova/db';
import { loadDotEnv } from '../config/env';

export class AdminPromoteError extends Error {}

/**
 * Bootstraps the first PLATFORM_ADMIN (README §14). A second promotion needs `force`, so a leaked
 * shell access cannot silently mint extra admins; both cases are audited.
 */
export const promoteAdmin = async (
  prisma: PrismaClient,
  { email, force }: { email: string; force: boolean },
): Promise<{ userId: string }> => {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: { id: true, emailVerified: true, role: true },
    });
    if (!user) throw new AdminPromoteError(`No user with email ${email}.`);
    if (!user.emailVerified) {
      throw new AdminPromoteError(`${email} has not verified the email address.`);
    }
    if (user.role === 'PLATFORM_ADMIN') {
      throw new AdminPromoteError(`${email} is already a PLATFORM_ADMIN.`);
    }
    const admins = await tx.user.count({ where: { role: 'PLATFORM_ADMIN' } });
    if (admins > 0 && !force) {
      throw new AdminPromoteError(
        'A PLATFORM_ADMIN already exists. Use the admin API, or --force for an emergency.',
      );
    }
    await tx.user.update({ where: { id: user.id }, data: { role: 'PLATFORM_ADMIN' } });
    await tx.auditEvent.create({
      data: {
        action: 'admin.bootstrap.promoted',
        outcome: 'SUCCESS',
        actorType: 'SYSTEM',
        targetType: 'USER',
        targetId: user.id,
        metadata: { forced: admins > 0 },
      },
    });
    return { userId: user.id };
  });
};

const main = async (): Promise<number> => {
  const { values } = parseArgs({
    options: { email: { type: 'string' }, force: { type: 'boolean', default: false } },
  });
  if (!values.email) {
    console.error('Usage: admin:promote --email <email> [--force]');
    return 1;
  }
  loadDotEnv();
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set.');
    return 1;
  }
  const prisma = createPrismaClient(process.env.DATABASE_URL);
  try {
    const { userId } = await promoteAdmin(prisma, { email: values.email, force: values.force });
    console.log(`User ${userId} is now PLATFORM_ADMIN.`);
    console.log(
      'Next: sign in and enable MFA. Admin APIs answer MFA_ENROLLMENT_REQUIRED until then.',
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
