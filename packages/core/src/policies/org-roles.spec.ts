import { OrgRole } from '@redova/contracts';
import { describe, expect, it } from 'vitest';
import { canAssignOrgRole, canManageMember, isValidOrgRole } from './org-roles';

const ROLES = OrgRole.options;
const FUNCTIONAL = ['SECURITY_ENGINEER', 'AI_DEVELOPER', 'AUDITOR', 'VIEWER'] as const;

describe('isValidOrgRole (UT-006-03)', () => {
  it.each(ROLES)('accepts %s', (role) => expect(isValidOrgRole(role)).toBe(true));
  it.each(['ORG_ADMIN,VIEWER', 'admin', 'owner', 'SUPERUSER', '', ' VIEWER', ['VIEWER'], null])(
    'rejects %j',
    (value) => expect(isValidOrgRole(value)).toBe(false),
  );
});

describe('canAssignOrgRole — full 6×6 table (UT-006-01)', () => {
  const expected = (actor: string, target: string) => {
    if (actor === 'ORG_OWNER') return true;
    if (actor === 'ORG_ADMIN') return (FUNCTIONAL as readonly string[]).includes(target);
    return false;
  };
  for (const actorRole of ROLES) {
    for (const targetRole of ROLES) {
      it(`${actorRole} → ${targetRole}`, () => {
        expect(canAssignOrgRole({ actorRole, targetRole })).toBe(expected(actorRole, targetRole));
      });
    }
  }
  it('rejects invalid values', () => {
    expect(canAssignOrgRole({ actorRole: 'ORG_OWNER', targetRole: 'ORG_ADMIN,VIEWER' })).toBe(
      false,
    );
    expect(canAssignOrgRole({ actorRole: 'owner', targetRole: 'VIEWER' })).toBe(false);
  });
});

describe('canManageMember (UT-006-02)', () => {
  const other = { actorMemberId: 'actor', targetMemberId: 'target' };
  const self = { actorMemberId: 'actor', targetMemberId: 'actor' };

  it('lets an owner manage anyone, including other owners (R1)', () => {
    for (const targetRole of ROLES) {
      expect(canManageMember({ ...other, actorRole: 'ORG_OWNER', targetRole })).toBe(true);
      for (const newRole of ROLES) {
        expect(canManageMember({ ...other, actorRole: 'ORG_OWNER', targetRole, newRole })).toBe(
          true,
        );
      }
    }
  });

  it('lets an admin manage only lower-ranked members and roles (R3, R4)', () => {
    for (const targetRole of ROLES) {
      for (const newRole of [undefined, ...ROLES]) {
        const allowed =
          (FUNCTIONAL as readonly string[]).includes(targetRole) &&
          (newRole === undefined || (FUNCTIONAL as readonly string[]).includes(newRole));
        expect(canManageMember({ ...other, actorRole: 'ORG_ADMIN', targetRole, newRole })).toBe(
          allowed,
        );
      }
    }
  });

  it('denies every management action to functional roles on others', () => {
    for (const actorRole of FUNCTIONAL) {
      for (const targetRole of ROLES) {
        expect(canManageMember({ ...other, actorRole, targetRole })).toBe(false);
        expect(canManageMember({ ...other, actorRole, targetRole, newRole: 'VIEWER' })).toBe(false);
      }
    }
  });

  it('forbids raising your own role and allows lowering it or removing yourself (R5)', () => {
    expect(
      canManageMember({
        ...self,
        actorRole: 'ORG_ADMIN',
        targetRole: 'ORG_ADMIN',
        newRole: 'ORG_OWNER',
      }),
    ).toBe(false);
    expect(
      canManageMember({ ...self, actorRole: 'VIEWER', targetRole: 'VIEWER', newRole: 'ORG_ADMIN' }),
    ).toBe(false);
    expect(
      canManageMember({
        ...self,
        actorRole: 'ORG_ADMIN',
        targetRole: 'ORG_ADMIN',
        newRole: 'VIEWER',
      }),
    ).toBe(true);
    expect(
      canManageMember({
        ...self,
        actorRole: 'ORG_OWNER',
        targetRole: 'ORG_OWNER',
        newRole: 'AUDITOR',
      }),
    ).toBe(true);
    expect(canManageMember({ ...self, actorRole: 'VIEWER', targetRole: 'VIEWER' })).toBe(true);
  });

  it('rejects invalid role values (R6)', () => {
    expect(
      canManageMember({ ...other, actorRole: 'ORG_OWNER', targetRole: 'VIEWER', newRole: 'admin' }),
    ).toBe(false);
    expect(canManageMember({ ...other, actorRole: 'ORG_OWNER', targetRole: 'member' })).toBe(false);
  });
});
