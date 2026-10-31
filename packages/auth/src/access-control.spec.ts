import { describe, expect, it } from 'vitest';
import { globalRoles, orgRoles } from './access-control';

describe('access control (UT-001-06 — spot checks; full matrix in UM-006)', () => {
  it('defines the six organization roles and two global roles', () => {
    expect(Object.keys(orgRoles).sort()).toEqual([
      'AI_DEVELOPER',
      'AUDITOR',
      'ORG_ADMIN',
      'ORG_OWNER',
      'SECURITY_ENGINEER',
      'VIEWER',
    ]);
    expect(Object.keys(globalRoles).sort()).toEqual(['PLATFORM_ADMIN', 'USER']);
  });

  it('denies invitation:create to VIEWER and grants auditLog:read to AUDITOR', () => {
    expect(orgRoles.VIEWER.authorize({ invitation: ['create'] }).success).toBe(false);
    expect(orgRoles.AUDITOR.authorize({ auditLog: ['read'] }).success).toBe(true);
  });

  it('never grants organization deletion or direct member creation', () => {
    for (const role of Object.values(orgRoles)) {
      expect(role.authorize({ organization: ['delete'] }).success).toBe(false);
      expect(role.authorize({ member: ['create'] }).success).toBe(false);
    }
  });

  it('grants PLATFORM_ADMIN account administration but not impersonation', () => {
    expect(
      globalRoles.PLATFORM_ADMIN.authorize({ user: ['ban', 'set-role'], session: ['revoke'] })
        .success,
    ).toBe(true);
    expect(globalRoles.PLATFORM_ADMIN.authorize({ user: ['impersonate'] }).success).toBe(false);
    expect(globalRoles.USER.authorize({ user: ['list'] }).success).toBe(false);
  });
});
