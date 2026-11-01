import { expect, test } from '@playwright/test';
import {
  mockOnboardingApi,
  previewLogo,
  previewOrganizationId,
  previewUserId,
} from './fixtures/onboarding-api';

test('retries upload without duplicating the organization, then retries only failed invitations', async ({
  page,
  baseURL,
}) => {
  const { requests, clientErrors } = await mockOnboardingApi(page, baseURL!, {
    failUpload: true,
    failInvite: true,
  });
  await page.goto('/onboarding');
  await page.getByLabel('Organization name').fill('Acme Security');
  await expect(page.getByText('Available', { exact: true })).toBeVisible();
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: previewLogo });
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Unable to save' })).toBeVisible();
  await expect(page.getByLabel('Organization slug')).toBeDisabled();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Invite your team' })).toBeVisible();
  expect(requests.filter((value) => value.path.endsWith('/organization/create'))).toHaveLength(1);
  expect(
    requests.filter((value) => value.path.endsWith('/logo') && value.method === 'POST'),
  ).toHaveLength(2);
  for (const [index, email] of ['sarah@acme.com', 'alex@acme.com', 'maya@acme.com'].entries()) {
    if (index) await page.getByRole('button', { name: 'Add another member' }).click();
    await page.getByLabel(`Work email ${index + 1}`, { exact: true }).fill(email);
  }
  await page.getByRole('button', { name: 'Send invitations', exact: true }).click();
  await expect(page.getByText('2 sent', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Work email 1', { exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Retry / continue' }).click();
  await expect(page).toHaveURL('/dashboard');
  await expect(page.getByRole('heading', { name: 'Acme Security' })).toBeVisible();
  const invitations = requests.filter((value) =>
    value.path.endsWith('/organization/invite-member'),
  );
  expect(invitations.map((value) => value.body?.email)).toEqual([
    'sarah@acme.com',
    'alex@acme.com',
    'maya@acme.com',
    'alex@acme.com',
  ]);
  expect(
    invitations.every(
      (value) => value.body?.organizationId === previewOrganizationId && !value.body?.resend,
    ),
  ).toBe(true);
  expect(
    await page.evaluate((id) => sessionStorage.getItem(`redova.onboarding:${id}`), previewUserId),
  ).toBeNull();
  expect(clientErrors).toEqual([]);
});

test('preserves the created organization when the page is reloaded after an upload failure', async ({
  page,
  baseURL,
}) => {
  const { requests } = await mockOnboardingApi(page, baseURL!, { failUpload: true });
  await page.goto('/onboarding?new=1');
  await page.getByLabel('Organization name').fill('Acme Security');
  await expect(page.getByText('Available', { exact: true })).toBeVisible();
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: previewLogo });
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Unable to save' })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Organization name')).toHaveValue('Acme Security');
  await expect(page.getByLabel('Organization slug')).toBeDisabled();
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: previewLogo });
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Invite your team' })).toBeVisible();
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await expect(page).toHaveURL('/dashboard');
  expect(requests.filter((value) => value.path.endsWith('/organization/create'))).toHaveLength(1);
  expect(
    requests.filter((value) => value.path.endsWith('/organization/invite-member')),
  ).toHaveLength(0);
});

test('does not interpret a failed membership query as an empty account', async ({
  page,
  baseURL,
}) => {
  await mockOnboardingApi(page, baseURL!, { listError: true });
  await page.goto('/onboarding');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
  await expect(page.getByLabel('Organization name')).toHaveCount(0);
});

test('does not show edit or invitation controls to a viewer', async ({ page, baseURL }) => {
  await mockOnboardingApi(page, baseURL!, {
    organizations: [{ id: previewOrganizationId, name: 'Existing', slug: 'existing' }],
    role: 'VIEWER',
  });
  await page.goto('/onboarding?organization=' + previewOrganizationId);
  await expect(page.getByRole('heading', { name: 'Your workspace is ready' })).toBeVisible();
  await expect(page.getByRole('form')).toHaveCount(0);
  await page.getByRole('button', { name: 'Continue to workspace' }).click();
  await expect(page).toHaveURL('/dashboard');
});

for (const scenario of [
  { name: 'anonymous', options: { noCookie: true }, destination: /\/sign-in\?next=/ },
  { name: 'unverified', options: { unverified: true }, destination: /\/verify-email$/ },
]) {
  test(`protects onboarding for an ${scenario.name} visitor`, async ({ page, baseURL }) => {
    await mockOnboardingApi(page, baseURL!, scenario.options);
    await page.goto('/onboarding');
    await expect(page).toHaveURL(scenario.destination);
  });
}

test('uses an existing workspace and lets its owner create another', async ({ page, baseURL }) => {
  await mockOnboardingApi(page, baseURL!, {
    organizations: [{ id: previewOrganizationId, name: 'Existing', slug: 'existing' }],
  });
  await page.goto('/onboarding');
  await expect(page).toHaveURL('/dashboard');
  await expect(page.getByRole('heading', { name: 'Existing' })).toBeVisible();
  await page.getByRole('link', { name: 'Create another workspace' }).click();
  await expect(page.getByLabel('Organization name')).toHaveValue('');
});

test('routes an empty dashboard and a verified email confirmation into onboarding', async ({
  page,
  baseURL,
}) => {
  await mockOnboardingApi(page, baseURL!);
  await page.goto('/dashboard');
  await expect(page).toHaveURL('/onboarding');
  await expect(page.getByRole('heading', { name: 'Organization Onboarding' })).toBeVisible();
  await page.goto('/verify-email');
  await expect(page).toHaveURL('/onboarding');
  await expect(page.getByRole('heading', { name: 'Organization Onboarding' })).toBeVisible();
});

test('keeps controls in the viewport on phones, tablets and desktops', async ({
  page,
  baseURL,
}) => {
  await mockOnboardingApi(page, baseURL!);
  await page.goto('/onboarding');
  await expect(page.getByRole('heading', { name: 'Organization Onboarding' })).toBeVisible();
  for (const size of [
    { width: 320, height: 740 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1100, height: 700 },
    { width: 1280, height: 720 },
    { width: 1672, height: 941 },
    { width: 2560, height: 1440 },
  ]) {
    await page.setViewportSize(size);
    const dimensions = await page.evaluate(() => ({
      viewport: innerWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
  }
});
