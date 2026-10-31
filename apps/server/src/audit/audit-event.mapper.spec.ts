import type { AuditEvent } from '@redova/db';
import { describe, expect, it } from 'vitest';
import { resolveActor, toAuditEventDto } from './audit-event.mapper';

const alice = { id: 'u1', name: 'Alice', email: 'alice@acme.io' };
const users = new Map([[alice.id, alice]]);

const event = (overrides: Partial<AuditEvent> = {}): AuditEvent => ({
  id: '0192f5b4-7c3a-7000-8000-000000000001',
  occurredAt: new Date('2026-10-31T12:00:00.000Z'),
  action: 'admin.user.role_changed',
  outcome: 'SUCCESS',
  actorType: 'USER',
  actorUserId: alice.id,
  organizationId: null,
  targetType: 'USER',
  targetId: 'u2',
  ipAddress: '203.0.113.7',
  userAgent: 'vitest',
  requestId: 'req-1',
  metadata: { previousRole: 'USER', newRole: 'PLATFORM_ADMIN' },
  ...overrides,
});

describe('audit actor resolution (UT-008-04)', () => {
  it('resolves USER actors', () => {
    expect(resolveActor(event(), users)).toEqual(alice);
  });

  it('returns null for SYSTEM, ANONYMOUS and deleted users', () => {
    expect(resolveActor(event({ actorType: 'SYSTEM', actorUserId: null }), users)).toBeNull();
    expect(resolveActor(event({ actorType: 'ANONYMOUS', actorUserId: null }), users)).toBeNull();
    expect(resolveActor(event({ actorUserId: 'deleted-user' }), users)).toBeNull();
  });
});

describe('audit event DTO', () => {
  it('returns only allow-listed metadata keys', () => {
    const dto = toAuditEventDto(
      event({ metadata: { previousRole: 'USER', newRole: 'PLATFORM_ADMIN', token: 'leak' } }),
      users,
    );
    expect(dto.metadata).toEqual({ previousRole: 'USER', newRole: 'PLATFORM_ADMIN' });
    expect(dto.occurredAt).toBe('2026-10-31T12:00:00.000Z');
  });
});
