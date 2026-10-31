import { OrgRole } from '@redova/contracts';

/** Ranks are used only for member-management decisions (README §8.2, §10.4). */
export const ORG_ROLE_RANK: Record<OrgRole, number> = {
  ORG_OWNER: 100,
  ORG_ADMIN: 80,
  SECURITY_ENGINEER: 10,
  AI_DEVELOPER: 10,
  AUDITOR: 10,
  VIEWER: 10,
};

/** R6: exactly one known organization role (no comma-separated lists, no arrays). */
export const isValidOrgRole = (value: unknown): value is OrgRole =>
  typeof value === 'string' && OrgRole.safeParse(value).success;

/** R1/R3: who may invite or assign `targetRole`. */
export const canAssignOrgRole = ({
  actorRole,
  targetRole,
}: {
  actorRole: string;
  targetRole: string;
}): boolean => {
  if (!isValidOrgRole(actorRole) || !isValidOrgRole(targetRole)) return false;
  if (actorRole === 'ORG_OWNER') return true;
  if (actorRole === 'ORG_ADMIN') return ORG_ROLE_RANK[targetRole] < ORG_ROLE_RANK.ORG_ADMIN;
  return false;
};

export interface ManageMemberInput {
  actorRole: string;
  actorMemberId: string;
  targetMemberId: string;
  targetRole: string;
  /** Present for a role change, absent for a removal. */
  newRole?: string;
}

/**
 * R1, R3, R4, R5: whether the actor may change the role of, or remove, the target member.
 * The last-owner rule (R2) and the native `member:update` / `member:delete` permissions stay with Better Auth.
 */
export const canManageMember = ({
  actorRole,
  actorMemberId,
  targetMemberId,
  targetRole,
  newRole,
}: ManageMemberInput): boolean => {
  if (!isValidOrgRole(actorRole) || !isValidOrgRole(targetRole)) return false;
  if (newRole !== undefined && !isValidOrgRole(newRole)) return false;

  const isSelf = actorMemberId === targetMemberId;

  if (isSelf) {
    // Removing yourself is equivalent to leaving; changing your own role may only lower it (R5).
    return newRole === undefined || ORG_ROLE_RANK[newRole] <= ORG_ROLE_RANK[actorRole];
  }
  if (actorRole === 'ORG_OWNER') return true;
  if (actorRole === 'ORG_ADMIN') {
    const adminRank = ORG_ROLE_RANK.ORG_ADMIN;
    const targetBelow = ORG_ROLE_RANK[targetRole] < adminRank;
    const newRoleBelow = newRole === undefined || ORG_ROLE_RANK[newRole] < adminRank;
    return targetBelow && newRoleBelow;
  }
  return false;
};
