import { authClient } from '@/lib/auth-client';
import { apiFetch, RedovaApiError } from '@/lib/api';
import { authErrorMessage, type AuthErrorLike } from '@/lib/auth/auth-errors';
import type { InvitableRole, OrganizationInput } from './policy';

export type OrganizationSummary = { id: string; name: string; slug: string; logo?: string | null };
const messages: Record<string, string> = {
  ORGANIZATION_ALREADY_EXISTS: 'This slug is already in use. Choose another.',
  ORGANIZATION_SLUG_ALREADY_TAKEN: 'This slug is already in use. Choose another.',
  ORG_SLUG_RESERVED: 'This slug is reserved. Choose another.',
  ORG_SLUG_INVALID: 'The organization slug is invalid.',
  ORG_NAME_INVALID: 'Use an organization name of 2–64 characters.',
  ORG_LOGO_INVALID: 'Choose a valid PNG, JPG or WebP image, or an HTTPS image URL.',
  ORG_LOGO_TOO_LARGE: 'The logo is larger than 2 MB.',
  YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS:
    'You have reached the organization creation limit. Use an existing workspace.',
  USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION: 'This person already has a pending invitation.',
  USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION: 'This person is already a member.',
  ORG_ROLE_ESCALATION_FORBIDDEN: 'You cannot assign this role.',
  INVITATION_LIMIT_REACHED: 'This organization has reached its invitation limit.',
  FORBIDDEN_PERMISSION: 'You do not have permission to update this organization.',
};
export function onboardingMessage(error: unknown, fallback: string): string {
  if (error instanceof OnboardingApiError) return error.message;
  if (error instanceof RedovaApiError)
    return messages[error.code] ?? authErrorMessage(error, fallback);
  return authErrorMessage(error as AuthErrorLike, fallback);
}
export class OnboardingApiError extends Error {
  constructor(
    readonly code: string | undefined,
    message: string,
  ) {
    super(message);
  }
}
function fail(error: AuthErrorLike, fallback: string): never {
  throw new OnboardingApiError(
    error?.code,
    (error?.code && messages[error.code]) || authErrorMessage(error, fallback),
  );
}
export async function listOrganizations(): Promise<OrganizationSummary[]> {
  const { data, error } = await authClient.organization.list();
  if (error || !data) fail(error, 'Unable to load your workspaces. Please try again.');
  return data;
}
export async function checkSlug(slug: string, signal?: AbortSignal): Promise<boolean> {
  const { data, error } = await authClient.$fetch<{ status: boolean }>('/organization/check-slug', {
    method: 'POST',
    body: { slug },
    signal,
  });
  const code = (error as AuthErrorLike)?.code;
  if (code === 'ORGANIZATION_SLUG_ALREADY_TAKEN' || code === 'ORGANIZATION_ALREADY_EXISTS')
    return false;
  if (error || !data) fail(error, 'Unable to check this slug. Please try again.');
  return data.status === true;
}
export async function createOrganization(
  input: OrganizationInput & { logo?: string },
): Promise<OrganizationSummary> {
  const { data, error } = await authClient.organization.create(input);
  if (error || !data) fail(error, 'Unable to create your organization. Please try again.');
  return data;
}
export async function updateOrganization(
  organization: OrganizationSummary,
  input: { name: string; logo?: string },
): Promise<OrganizationSummary> {
  const { error } = await authClient.organization.update({
    organizationId: organization.id,
    data: input,
  });
  if (error) fail(error, 'Unable to update your organization. Please try again.');
  return { ...organization, ...input };
}
export async function setActiveOrganization(organizationId: string): Promise<void> {
  const { error } = await authClient.organization.setActive({ organizationId });
  if (error) fail(error, 'Unable to open this workspace. Please try again.');
}
export async function organizationRole(organizationId: string): Promise<string> {
  const { data, error } = await authClient.organization.getActiveMemberRole({
    query: { organizationId },
  });
  if (error || !data) fail(error, 'Unable to check your organization role. Please try again.');
  return data.role;
}
export async function inviteMember(
  organizationId: string,
  email: string,
  role: InvitableRole,
): Promise<void> {
  // REDOVA's custom roles are server-defined; this typed native request does not assume the plugin's default owner/admin/member role union.
  const { error } = await authClient.$fetch('/organization/invite-member', {
    method: 'POST',
    body: { organizationId, email, role },
  });
  if (error) fail(error, 'Unable to send this invitation. Please try again.');
}
export async function uploadOrganizationLogo(organizationId: string, file: File): Promise<string> {
  const body = new FormData();
  body.append('file', file, 'organization-logo');
  const { data } = await apiFetch<{ logo: string }>(
    `/organizations/${encodeURIComponent(organizationId)}/logo`,
    { method: 'POST', body },
  );
  return data.logo;
}
export async function removeOrganizationLogo(organizationId: string): Promise<void> {
  await apiFetch(`/organizations/${encodeURIComponent(organizationId)}/logo`, { method: 'DELETE' });
}
