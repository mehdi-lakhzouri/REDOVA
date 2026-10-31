/**
 * Where-clause fragment for tenant-owned models (README §10.3): every query includes the tenant,
 * and lookups by id use `findFirst({ where: tenantScoped(orgId, { id }) })`, never `findUnique({ id })`.
 */
export const tenantScoped = <T extends object = Record<never, never>>(
  organizationId: string,
  where?: T,
): T & { organizationId: string } => ({ ...(where as T), organizationId });
