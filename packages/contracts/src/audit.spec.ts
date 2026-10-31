import { describe, expect, it } from 'vitest';
import {
  AUDIT_METADATA_KEYS,
  AuditAction,
  auditEventInputSchema,
  orgAuditEventQuerySchema,
  pickAllowedMetadata,
  platformAuditEventQuerySchema,
  unknownMetadataKeys,
} from './audit';
import { emailJobSchema } from './email-jobs';

describe('audit catalog (UT-001-07)', () => {
  it('contains exactly the actions of README §17.4', () => {
    expect(AuditAction.options).toMatchSnapshot();
    expect(AuditAction.options).toHaveLength(34);
  });

  it('rejects unknown actions', () => {
    expect(
      auditEventInputSchema.safeParse({
        action: 'auth.unknown',
        outcome: 'SUCCESS',
        actorType: 'USER',
      }).success,
    ).toBe(false);
  });
});

describe('email job schema', () => {
  it('validates the variables of each template', () => {
    const job = {
      template: 'verify-email',
      to: 'alice@acme.io',
      dedupeKey: 'https://api.redova.io/verify?token=x',
      variables: {
        name: 'Alice',
        verifyUrl: 'https://api.redova.io/verify?token=x',
        expiresInHours: 24,
      },
    };
    expect(emailJobSchema.safeParse(job).success).toBe(true);
    expect(emailJobSchema.safeParse({ ...job, template: 'unknown' }).success).toBe(false);
    expect(emailJobSchema.safeParse({ ...job, variables: { name: 'Alice' } }).success).toBe(false);
  });
});

describe('audit event queries (UT-008-01)', () => {
  it('accepts one or several actions and normalizes them to a list', () => {
    expect(orgAuditEventQuerySchema.parse({ action: 'org.created' }).action).toEqual([
      'org.created',
    ]);
    expect(
      orgAuditEventQuerySchema.parse({ action: ['org.created', 'org.updated'] }).action,
    ).toEqual(['org.created', 'org.updated']);
  });

  it('rejects unknown actions', () => {
    expect(orgAuditEventQuerySchema.safeParse({ action: 'org.deleted' }).success).toBe(false);
  });

  it('limits the date range to 90 days, in order', () => {
    const from = '2026-01-01T00:00:00.000Z';
    expect(
      orgAuditEventQuerySchema.safeParse({ from, to: '2026-03-31T00:00:00.000Z' }).success,
    ).toBe(true);
    expect(
      orgAuditEventQuerySchema.safeParse({ from, to: '2026-04-02T00:00:00.000Z' }).success,
    ).toBe(false);
    expect(
      orgAuditEventQuerySchema.safeParse({ from: '2026-02-01T00:00:00.000Z', to: from }).success,
    ).toBe(false);
  });

  it('only the platform query filters by actor', () => {
    expect(platformAuditEventQuerySchema.parse({ actorUserId: 'u1' }).actorUserId).toBe('u1');
    expect('actorUserId' in orgAuditEventQuerySchema.parse({ actorUserId: 'u1' })).toBe(false);
  });
});

describe('audit metadata allow-list (UT-008-02)', () => {
  it('covers every audit action', () => {
    expect(Object.keys(AUDIT_METADATA_KEYS).sort()).toEqual([...AuditAction.options].sort());
  });

  it('reports unknown keys and keeps only allowed ones', () => {
    const metadata = { previousRole: 'USER', newRole: 'PLATFORM_ADMIN', password: 'x' };
    expect(unknownMetadataKeys('admin.user.role_changed', metadata)).toEqual(['password']);
    expect(pickAllowedMetadata('admin.user.role_changed', metadata)).toEqual({
      previousRole: 'USER',
      newRole: 'PLATFORM_ADMIN',
    });
    expect(pickAllowedMetadata('admin.user.unbanned', metadata)).toEqual({});
    expect(pickAllowedMetadata('org.updated', null)).toEqual({});
  });
});
