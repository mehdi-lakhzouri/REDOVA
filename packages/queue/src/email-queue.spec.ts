import { describe, expect, it, vi } from 'vitest';
import type { Queue } from 'bullmq';
import type { EmailJob } from '@redova/contracts';
import { createEnqueueEmail, EMAIL_JOB_OPTIONS, emailJobId } from './email-queue';

const job: EmailJob = {
  template: 'verify-email',
  to: 'alice@acme.io',
  dedupeKey: 'https://api.redova.io/api/auth/verify-email?token=abc',
  variables: {
    name: 'Alice',
    verifyUrl: 'https://api.redova.io/api/auth/verify-email?token=abc',
    expiresInHours: 24,
  },
};

describe('email job ids (UT-003-05)', () => {
  it('is deterministic, differs per dedupe key and contains no colon', () => {
    expect(emailJobId(job)).toBe(emailJobId({ ...job }));
    expect(emailJobId(job)).not.toBe(emailJobId({ ...job, dedupeKey: 'other' }));
    expect(emailJobId(job)).toMatch(/^verify-email-[0-9a-f]{64}$/);
    expect(emailJobId(job)).not.toContain('abc');
  });
});

describe('createEnqueueEmail', () => {
  it('validates the payload and enqueues with retry options', async () => {
    const add = vi.fn().mockResolvedValue(undefined);
    const enqueue = createEnqueueEmail({ add } as unknown as Queue<EmailJob>);
    await enqueue(job);
    expect(add).toHaveBeenCalledWith('verify-email', job, {
      ...EMAIL_JOB_OPTIONS,
      jobId: emailJobId(job),
    });
  });

  it('rejects an invalid job before reaching Redis (UT-003-06)', async () => {
    const add = vi.fn();
    const enqueue = createEnqueueEmail({ add } as unknown as Queue<EmailJob>);
    await expect(
      enqueue({ ...job, variables: { name: 'x' } } as unknown as EmailJob),
    ).rejects.toThrow();
    expect(add).not.toHaveBeenCalled();
  });
});
