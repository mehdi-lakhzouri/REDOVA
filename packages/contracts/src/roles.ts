import { z } from 'zod';

/** Global role stored in `user.role` (Better Auth admin plugin). */
export const GlobalRole = z.enum(['PLATFORM_ADMIN', 'USER']);
export type GlobalRole = z.infer<typeof GlobalRole>;

/** Organization role stored in `member.role` (Better Auth organization plugin). */
export const OrgRole = z.enum([
  'ORG_OWNER',
  'ORG_ADMIN',
  'SECURITY_ENGINEER',
  'AI_DEVELOPER',
  'AUDITOR',
  'VIEWER',
]);
export type OrgRole = z.infer<typeof OrgRole>;

export const ORG_ROLE_LABELS: Record<OrgRole, string> = {
  ORG_OWNER: 'Owner',
  ORG_ADMIN: 'Admin',
  SECURITY_ENGINEER: 'Security Engineer',
  AI_DEVELOPER: 'AI Developer',
  AUDITOR: 'Auditor',
  VIEWER: 'Viewer',
};
