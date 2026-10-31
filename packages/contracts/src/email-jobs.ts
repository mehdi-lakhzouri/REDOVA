import { z } from 'zod';

const base = {
  to: z.email(),
  /** Stable key used to deduplicate retries of the same email (e.g. the action URL). */
  dedupeKey: z.string().min(1),
};

export const verifyEmailJob = z.object({
  ...base,
  template: z.literal('verify-email'),
  variables: z.object({
    name: z.string(),
    verifyUrl: z.url(),
    expiresInHours: z.number().int().positive(),
  }),
});

export const resetPasswordJob = z.object({
  ...base,
  template: z.literal('reset-password'),
  variables: z.object({
    name: z.string(),
    resetUrl: z.url(),
    expiresInMinutes: z.number().int().positive(),
    requestIp: z.string().nullish(),
  }),
});

export const existingAccountJob = z.object({
  ...base,
  template: z.literal('existing-account'),
  variables: z.object({ name: z.string(), signInUrl: z.url(), resetUrl: z.url() }),
});

export const organizationInvitationJob = z.object({
  ...base,
  template: z.literal('organization-invitation'),
  variables: z.object({
    inviterName: z.string(),
    organizationName: z.string(),
    roleLabel: z.string(),
    acceptUrl: z.url(),
    expiresAt: z.string(),
  }),
});

export const securityNotificationJob = z.object({
  ...base,
  template: z.literal('security-notification'),
  variables: z.object({
    name: z.string(),
    eventLabel: z.string(),
    occurredAt: z.string(),
    ipAddress: z.string().nullish(),
    secureAccountUrl: z.url(),
  }),
});

export const emailJobSchema = z.discriminatedUnion('template', [
  verifyEmailJob,
  resetPasswordJob,
  existingAccountJob,
  organizationInvitationJob,
  securityNotificationJob,
]);

export type EmailJob = z.infer<typeof emailJobSchema>;
export type EmailTemplate = EmailJob['template'];

/** Enqueues a transactional email. Implemented with BullMQ in UM-003. */
export type EnqueueEmail = (job: EmailJob) => Promise<void>;
