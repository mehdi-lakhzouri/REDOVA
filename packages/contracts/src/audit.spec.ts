import { describe, expect, it } from 'vitest';
import { AuditAction, auditEventInputSchema } from './audit';
import { emailJobSchema } from './email-jobs';

describe('audit catalog (UT-001-07)', () => {
  it('contains exactly the actions of README §17.4', () => {
    expect(AuditAction.options).toMatchSnapshot();
    expect(AuditAction.options).toHaveLength(32);
  });

  it('rejects unknown actions', () => {
    expect(
      auditEventInputSchema.safeParse({ action: 'auth.unknown', outcome: 'SUCCESS', actorType: 'USER' }).success,
    ).toBe(false);
  });
});

describe('email job schema', () => {
  it('validates the variables of each template', () => {
    const job = {
      template: 'verify-email',
      to: 'alice@acme.io',
      dedupeKey: 'https://api.redova.io/verify?token=x',
      variables: { name: 'Alice', verifyUrl: 'https://api.redova.io/verify?token=x', expiresInHours: 24 },
    };
    expect(emailJobSchema.safeParse(job).success).toBe(true);
    expect(emailJobSchema.safeParse({ ...job, template: 'unknown' }).success).toBe(false);
    expect(emailJobSchema.safeParse({ ...job, variables: { name: 'Alice' } }).success).toBe(false);
  });
});
