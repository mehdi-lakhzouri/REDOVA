import { createAccessControl } from 'better-auth/plugins/access';
import { defaultStatements as adminDefaultStatements } from 'better-auth/plugins/admin/access';

/**
 * Organization-level permission statements (README §9.1).
 * `organization`, `member` and `invitation` include the actions Better Auth checks internally.
 * Domain resources (agent, assessment, finding, report) are declared now and enforced by future modules.
 */
export const orgStatements = {
  organization: ['update', 'delete'],
  member: ['create', 'read', 'update', 'delete'],
  invitation: ['create', 'read', 'cancel'],
  auditLog: ['read'],
  agent: ['read', 'create', 'update', 'delete'],
  assessment: ['read', 'create', 'execute', 'cancel'],
  finding: ['read', 'triage'],
  report: ['read', 'generate'],
} as const;

export const orgAc = createAccessControl(orgStatements);

const readAll = {
  member: ['read'],
  invitation: ['read'],
  agent: ['read'],
  assessment: ['read'],
  finding: ['read'],
  report: ['read'],
} as const;

export const orgRoles = {
  ORG_OWNER: orgAc.newRole({
    organization: ['update'],
    member: ['read', 'update', 'delete'],
    invitation: ['create', 'read', 'cancel'],
    auditLog: ['read'],
    agent: ['read', 'create', 'update', 'delete'],
    assessment: ['read', 'create', 'execute', 'cancel'],
    finding: ['read', 'triage'],
    report: ['read', 'generate'],
  }),
  ORG_ADMIN: orgAc.newRole({
    organization: ['update'],
    member: ['read', 'update', 'delete'],
    invitation: ['create', 'read', 'cancel'],
    auditLog: ['read'],
    agent: ['read', 'create', 'update', 'delete'],
    assessment: ['read', 'create', 'execute', 'cancel'],
    finding: ['read', 'triage'],
    report: ['read', 'generate'],
  }),
  SECURITY_ENGINEER: orgAc.newRole({
    ...readAll,
    assessment: ['read', 'create', 'execute', 'cancel'],
    finding: ['read', 'triage'],
    report: ['read', 'generate'],
  }),
  AI_DEVELOPER: orgAc.newRole({
    ...readAll,
    agent: ['read', 'create', 'update'],
  }),
  AUDITOR: orgAc.newRole({
    ...readAll,
    auditLog: ['read'],
    report: ['read', 'generate'],
  }),
  VIEWER: orgAc.newRole(readAll),
};

/** Global (platform) permission statements (README §9.2), extending the admin plugin defaults. */
export const globalStatements = {
  ...adminDefaultStatements,
  auditLog: ['read'],
} as const;

export const globalAc = createAccessControl(globalStatements);

export const globalRoles = {
  PLATFORM_ADMIN: globalAc.newRole({
    user: ['list', 'get', 'ban', 'set-role'],
    session: ['list', 'revoke'],
    auditLog: ['read'],
  }),
  USER: globalAc.newRole({ user: [], session: [] }),
};

export type OrgPermissions = {
  [K in keyof typeof orgStatements]?: (typeof orgStatements)[K][number][];
};
export type GlobalPermissions = {
  [K in keyof typeof globalStatements]?: (typeof globalStatements)[K][number][];
};

/** Evaluates organization permissions with the same definitions Better Auth uses (README §10.2). */
export const hasOrgPermission = (role: string, permissions: OrgPermissions): boolean => {
  const definition = (
    orgRoles as Record<string, (typeof orgRoles)[keyof typeof orgRoles] | undefined>
  )[role];
  return (
    definition?.authorize(permissions as Parameters<typeof definition.authorize>[0]).success ??
    false
  );
};
