import { prismaAdapter } from '@better-auth/prisma-adapter';
import type { AuditEventInput, EnqueueEmail, RecordAuditEvent } from '@redova/contracts';
import type { PrismaClient } from '@redova/db';
import { betterAuth } from 'better-auth';
import { admin } from 'better-auth/plugins/admin';
import { haveIBeenPwned } from 'better-auth/plugins/haveibeenpwned';
import { openAPI } from 'better-auth/plugins/open-api';
import { organization } from 'better-auth/plugins/organization';
import { twoFactor } from 'better-auth/plugins/two-factor';
import type { Redis } from 'ioredis';
import { globalAc, globalRoles, orgAc, orgRoles } from './access-control';
import { createAuditHooks } from './audit-hooks';
import { createRedisRateLimitStorage } from './redis-rate-limit-storage';

export interface CreateAuthOptions {
  prisma: PrismaClient;
  /** Rate-limit counters live in Redis; without it (CLI, unit tests) Better Auth falls back to memory. */
  redis?: Redis;
  enqueueEmail: EnqueueEmail;
  recordAudit: RecordAuditEvent;
  secret: string;
  /** Public origin of the server (`BETTER_AUTH_URL`). */
  baseURL: string;
  /** The only trusted origin (`WEB_ORIGIN`). */
  webOrigin: string;
  production: boolean;
  hibpEnabled: boolean;
  rateLimitEnabled: boolean;
  onAuditError?: (error: unknown) => void;
}

const DAY = 60 * 60 * 24;

export const SESSION_FRESH_AGE_SECONDS = 60 * 60;
export const EMAIL_VERIFICATION_EXPIRES_IN_SECONDS = DAY;

/** HTTP paths that REDOVA wraps or excludes (README §4.6). `auth.api.*` server calls keep working. */
export const DISABLED_PATHS = [
  '/admin/list-users',
  '/admin/get-user',
  '/admin/ban-user',
  '/admin/unban-user',
  '/admin/set-role',
  '/admin/list-user-sessions',
  '/admin/revoke-user-session',
  '/admin/revoke-user-sessions',
  '/admin/create-user',
  '/admin/update-user',
  '/admin/remove-user',
  '/admin/set-user-password',
  '/admin/impersonate-user',
  '/admin/stop-impersonating',
  '/admin/has-permission',
  '/organization/delete',
  '/two-factor/send-otp',
  '/two-factor/verify-otp',
  '/delete-user',
  '/change-email',
];

/** Per-IP rules for credential endpoints (README Appendix C.2). */
export const RATE_LIMIT_RULES = {
  '/sign-in/email': { window: 60, max: 5 },
  '/sign-up/email': { window: 300, max: 5 },
  '/request-password-reset': { window: 300, max: 3 },
  '/reset-password': { window: 300, max: 5 },
  '/send-verification-email': { window: 300, max: 3 },
  '/two-factor/verify-totp': { window: 60, max: 5 },
  '/two-factor/verify-backup-code': { window: 60, max: 5 },
  '/organization/invite-member': { window: 60, max: 10 },
};

export const createAuth = (options: CreateAuthOptions) => {
  const { prisma, redis, enqueueEmail, recordAudit, production } = options;

  /** Audit writes must never break an authentication flow (README §17.4). */
  const audit = async (input: AuditEventInput): Promise<void> => {
    try {
      await recordAudit(input);
    } catch (error) {
      options.onAuditError?.(error);
    }
  };

  return betterAuth({
    appName: 'REDOVA',
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
    secret: options.secret,
    baseURL: options.baseURL,
    trustedOrigins: [options.webOrigin],
    disabledPaths: DISABLED_PATHS,
    user: {
      additionalFields: {
        firstName: { type: 'string', required: false },
        lastName: { type: 'string', required: false },
        // Tracking timestamps are owned by the server, never supplied by API clients.
        lastLoginAt: { type: 'date', required: false, input: false },
        onboardingCompletedAt: { type: 'date', required: false, input: false },
        lastActiveAt: { type: 'date', required: false, input: false },
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: 30 * 60,
      revokeSessionsOnPasswordReset: true,
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      expiresIn: EMAIL_VERIFICATION_EXPIRES_IN_SECONDS,
      sendVerificationEmail: async ({ user, url }) => {
        await enqueueEmail({
          template: 'verify-email',
          to: user.email,
          dedupeKey: url,
          variables: {
            name: user.name,
            verifyUrl: url,
            expiresInHours: EMAIL_VERIFICATION_EXPIRES_IN_SECONDS / 3600,
          },
        });
      },
    },
    session: {
      expiresIn: 7 * DAY,
      updateAge: DAY,
      freshAge: SESSION_FRESH_AGE_SECONDS,
    },
    verification: { storeIdentifier: 'hashed' },
    rateLimit: {
      enabled: options.rateLimitEnabled,
      window: 60,
      max: 100,
      customRules: RATE_LIMIT_RULES,
      ...(redis ? { customStorage: createRedisRateLimitStorage(redis) } : {}),
    },
    advanced: {
      cookiePrefix: 'redova',
      // Explicit: Better Auth skips origin/CSRF checks when NODE_ENV=test unless this is set,
      // which would make the security tests meaningless.
      disableOriginCheck: false,
      useSecureCookies: production,
      ipAddress: { ipAddressHeaders: ['x-forwarded-for'] },
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await audit({
              action: 'auth.sign_up.completed',
              outcome: 'SUCCESS',
              actorType: 'USER',
              actorUserId: user.id,
              targetType: 'USER',
              targetId: user.id,
            });
          },
        },
      },
      session: {
        create: {
          after: async (session) => {
            await audit({
              action: 'auth.session.created',
              outcome: 'SUCCESS',
              actorType: 'USER',
              actorUserId: session.userId,
              targetType: 'SESSION',
              targetId: session.id,
              ipAddress: session.ipAddress,
              userAgent: session.userAgent,
            });
          },
        },
      },
    },
    // Endpoint audit hooks (UM-002). `hooks` must stay an object for @thallesp/nestjs-better-auth.
    hooks: createAuditHooks(audit),
    plugins: [
      admin({
        ac: globalAc,
        roles: globalRoles,
        defaultRole: 'USER',
        adminRoles: ['PLATFORM_ADMIN'],
        bannedUserMessage: 'Your account has been suspended. Contact support.',
      }),
      organization({
        ac: orgAc,
        roles: orgRoles,
        creatorRole: 'ORG_OWNER',
        allowUserToCreateOrganization: async (user) => user.emailVerified === true,
        organizationLimit: 3,
        invitationExpiresIn: 7 * DAY,
        cancelPendingInvitationsOnReInvite: true,
        requireEmailVerificationOnInvitation: true,
        disableOrganizationDeletion: true,
        schema: {
          organization: {
            additionalFields: {
              status: { type: 'string', required: true, defaultValue: 'ACTIVE', input: false },
              suspendedAt: { type: 'date', required: false, input: false },
              suspensionReason: { type: 'string', required: false, input: false },
              archivedAt: { type: 'date', required: false, input: false },
              updatedAt: {
                type: 'date',
                required: true,
                defaultValue: () => new Date(),
                onUpdate: () => new Date(),
                input: false,
              },
            },
          },
          member: {
            additionalFields: {
              status: { type: 'string', required: true, defaultValue: 'ACTIVE', input: false },
              suspendedAt: { type: 'date', required: false, input: false },
              lastActiveAt: { type: 'date', required: false, input: false },
            },
          },
        },
      }),
      twoFactor({ issuer: 'REDOVA', trustDeviceMaxAge: 7 * DAY }),
      haveIBeenPwned({
        enabled: options.hibpEnabled,
        customPasswordCompromisedMessage:
          'This password appears in a known data breach. Choose a different one.',
      }),
      ...(production ? [] : [openAPI()]),
    ],
  });
};

export type Auth = ReturnType<typeof createAuth>;
