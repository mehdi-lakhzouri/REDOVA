import type { OrgRole } from './roles';

/** Tenant resolved by OrgPermissionGuard from the URL path and the caller's membership (README §10.2). */
export interface TenantContext {
  userId: string;
  organizationId: string;
  memberId: string;
  role: OrgRole;
}
