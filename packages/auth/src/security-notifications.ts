import type { EnqueueEmail } from '@redova/contracts';

/** `security-notification` subjects and headlines (README §16.2). */
export const SECURITY_EVENT_LABELS = {
  password_reset: 'Password reset',
  password_changed: 'Password changed',
  mfa_enabled: 'Two-factor authentication enabled',
  mfa_disabled: 'Two-factor authentication disabled',
  backup_codes_regenerated: 'Backup codes regenerated',
} as const;

export type SecurityEvent = keyof typeof SECURITY_EVENT_LABELS;

/** First hop of X-Forwarded-For (README §4.1 `ipAddressHeaders`), for security notifications. */
export const clientIp = (request?: Request): string | null =>
  request?.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;

/** Tells the account owner about a security change, so a silent takeover gets noticed. */
export const createSecurityNotifier =
  (enqueueEmail: EnqueueEmail, webOrigin: string) =>
  async (
    user: { id: string; email: string; name: string },
    event: SecurityEvent,
    request?: Request,
  ): Promise<void> => {
    const occurredAt = new Date().toISOString();
    await enqueueEmail({
      template: 'security-notification',
      to: user.email,
      dedupeKey: `${event}:${user.id}:${occurredAt}`,
      variables: {
        name: user.name,
        eventLabel: SECURITY_EVENT_LABELS[event],
        occurredAt,
        ipAddress: clientIp(request),
        secureAccountUrl: `${webOrigin}/account/security`,
      },
    });
  };

export type NotifySecurityEvent = ReturnType<typeof createSecurityNotifier>;
