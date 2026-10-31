import type { RecordAuditEvent } from '@redova/contracts';
import { APIError, isAPIError } from 'better-auth/api';
import type { Redis } from 'ioredis';
import { type AuthHookHandler, hashEmail } from './audit-hooks';

/** Per-account sign-in throttle (README §17.2 SR-09): 10 failures in 15 minutes, from any IP. */
export const SIGN_IN_THROTTLE = { maxFailures: 10, windowSeconds: 15 * 60 } as const;

export const SIGN_IN_THROTTLE_ERROR = {
  code: 'TOO_MANY_ATTEMPTS',
  message: 'Too many sign-in attempts. Try again later.',
} as const;

/** The key holds a hash: raw emails are never stored in Redis. */
export const signInThrottleKey = (email: string): string =>
  `redova:signin-fail:${hashEmail(email)}`;

// INCR, and start the window on the first failure only, in one atomic step.
const RECORD_FAILURE_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
`;

const emailOf = (body: unknown): string | null => {
  const email = (body as { email?: unknown } | undefined)?.email;
  return typeof email === 'string' && email.length > 0 ? email : null;
};

/**
 * Counts failed password sign-ins per account. Existing and unknown emails are counted and answered
 * the same way, so the throttle never reveals whether an account exists.
 */
export const createSignInThrottle = (redis: Redis, audit: RecordAuditEvent) => {
  const before: AuthHookHandler = async (ctx) => {
    if (ctx.path !== '/sign-in/email') return;
    const email = emailOf(ctx.body);
    if (!email) return;
    const failures = Number(await redis.get(signInThrottleKey(email)));
    if (failures < SIGN_IN_THROTTLE.maxFailures) return;
    const existing = await ctx.context.internalAdapter.findUserByEmail(email);
    await audit({
      action: 'auth.sign_in.throttled',
      outcome: 'DENIED',
      actorType: 'ANONYMOUS',
      targetType: existing ? 'USER' : null,
      targetId: existing?.user.id ?? null,
      metadata: { emailHash: hashEmail(email) },
    });
    throw new APIError('TOO_MANY_REQUESTS', SIGN_IN_THROTTLE_ERROR);
  };

  const after: AuthHookHandler = async (ctx) => {
    if (ctx.path !== '/sign-in/email') return;
    const email = emailOf(ctx.body);
    if (!email) return;
    const returned: unknown = ctx.context.returned;
    if (!isAPIError(returned)) {
      await redis.del(signInThrottleKey(email));
      return;
    }
    if ((returned.body as { code?: string } | undefined)?.code === 'INVALID_EMAIL_OR_PASSWORD') {
      await redis.eval(
        RECORD_FAILURE_SCRIPT,
        1,
        signInThrottleKey(email),
        SIGN_IN_THROTTLE.windowSeconds,
      );
    }
  };

  return { before, after };
};
