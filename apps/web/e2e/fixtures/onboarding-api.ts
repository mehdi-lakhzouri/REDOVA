import type { Page, Route } from '@playwright/test';

export const previewUserId = 'onboard-user';
export const previewOrganizationId = 'onboard-workspace';
export const previewLogo = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZcwAAAAASUVORK5CYII=',
  'base64',
);
type Organization = { id: string; name: string; slug: string; logo?: string | null };
type Options = {
  organizations?: Organization[];
  unverified?: boolean;
  noCookie?: boolean;
  listError?: boolean;
  role?: string;
  failUpload?: boolean;
  failInvite?: boolean;
};
type RecordedRequest = { path: string; method: string; body?: Record<string, string> };
const success = (route: Route, body: unknown) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
const failure = (route: Route, status: number, code: string) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ code }) });

/** Browser-only contract fixtures. No request reaches an email service or the application database. */
export async function mockOnboardingApi(page: Page, baseURL: string, options: Options = {}) {
  if (!options.noCookie)
    await page
      .context()
      .addCookies([{ name: 'redova.session_token', value: 'preview-token', url: baseURL }]);
  const organizations = structuredClone(options.organizations ?? []);
  let active = organizations[0]?.id ?? null;
  let uploadFailed = false,
    inviteFailed = false;
  const requests: RecordedRequest[] = [];
  const clientErrors: string[] = [];
  page.on('pageerror', (error) => clientErrors.push(error.message));
  await page.route('**/api/auth/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const body = (request.postDataJSON() ?? {}) as Record<string, string>;
    requests.push({ path, method: request.method(), body });
    if (path.endsWith('/get-session'))
      return success(route, {
        user: {
          id: previewUserId,
          name: 'Preview Owner',
          email: 'owner@example.com',
          emailVerified: !options.unverified,
          role: 'USER',
          image: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        session: {
          id: 'preview-session',
          token: 'preview-token',
          userId: previewUserId,
          activeOrganizationId: active,
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });
    if (path.endsWith('/organization/list'))
      return options.listError
        ? failure(route, 500, 'INTERNAL_ERROR')
        : success(route, organizations);
    if (path.endsWith('/organization/check-slug'))
      return body.slug === 'taken-workspace'
        ? failure(route, 400, 'ORGANIZATION_SLUG_ALREADY_TAKEN')
        : success(route, { status: true });
    if (path.endsWith('/organization/create')) {
      const organization = {
        id: previewOrganizationId,
        name: body.name,
        slug: body.slug,
        logo: body.logo ?? null,
      };
      organizations.push(organization);
      active = organization.id;
      return success(route, { ...organization, createdAt: new Date().toISOString(), members: [] });
    }
    if (path.endsWith('/organization/update')) {
      const organization = organizations.find((value) => value.id === body.organizationId);
      Object.assign(organization!, body.data);
      return success(route, organization);
    }
    if (path.endsWith('/organization/get-active-member-role'))
      return success(route, { role: options.role ?? 'ORG_OWNER' });
    if (path.endsWith('/organization/set-active')) {
      active = body.organizationId;
      return success(
        route,
        organizations.find((value) => value.id === active),
      );
    }
    if (path.endsWith('/organization/invite-member')) {
      if (options.failInvite && body.email === 'alex@acme.com' && !inviteFailed) {
        inviteFailed = true;
        return failure(route, 500, 'INTERNAL_ERROR');
      }
      return success(route, {
        id: 'invitation-' + body.email,
        ...body,
        status: 'pending',
        expiresAt: new Date(Date.now() + 604800000).toISOString(),
      });
    }
    throw new Error('Unexpected Better Auth request: ' + path);
  });
  await page.route('**/api/v1/organizations/**/logo**', async (route) => {
    const request = route.request();
    requests.push({ path: new URL(request.url()).pathname, method: request.method() });
    if (request.method() === 'GET')
      return route.fulfill({ status: 200, contentType: 'image/png', body: previewLogo });
    if (request.method() === 'POST' && options.failUpload && !uploadFailed) {
      uploadFailed = true;
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ data: null, error: { code: 'INTERNAL_ERROR' } }),
      });
    }
    const logo = `${baseURL}/api/v1/organizations/${previewOrganizationId}/logo/9d104101-2a00-4000-8000-000000000001`;
    organizations.find((value) => value.id === previewOrganizationId)!.logo =
      request.method() === 'DELETE' ? null : logo;
    return request.method() === 'DELETE'
      ? route.fulfill({ status: 204 })
      : success(route, { data: { logo }, error: null });
  });
  return { requests, clientErrors };
}
