import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, inject, it } from 'vitest';
import { totpFromUri } from '../support/totp';
import { ApiClient, extractLink, pathOf, waitForEmail } from './support/client';

/**
 * API end-to-end journeys (README §19.4) against the running server and worker. They run in order
 * and share state (organization A, Bob, the admin), like a real tenant would. Every secret seen on
 * the way is collected and searched for in the process logs at the end (SR-11).
 */
const ctx = inject('e2e');
const PASSWORD = 'e2e-correct-horse-battery';
const run = Date.now().toString(36);
const emailOf = (name: string) => `${name}-${run}@redova.test`;
const secrets = new Set<string>([PASSWORD]);

const remember = (...values: Array<string | undefined>) => {
  for (const value of values) if (value && value.length >= 6) secrets.add(value);
};

/** Signs up and follows the emailed verification link, which signs the user in. */
const signUpAndVerify = async (name: string) => {
  const email = emailOf(name);
  const client = new ApiClient(ctx);
  const signUp = await client.post('/api/auth/sign-up/email', {
    name,
    email,
    password: PASSWORD,
    callbackURL: `${ctx.webOrigin}/welcome`,
  });
  expect(signUp.status).toBe(200);
  const message = await waitForEmail(ctx, email, 'Verify your');
  const link = extractLink(message.Text, `${ctx.baseUrl}/api/auth/verify-email`);
  remember(new URL(link).searchParams.get('token') ?? undefined);
  const verified = await client.get(pathOf(link));
  expect(verified.status).toBe(302);
  expect(verified.headers.get('location')).toBe(`${ctx.webOrigin}/welcome`);
  remember(client.sessionToken);
  const user = (await client.get('/api/auth/get-session')).body.user as { id: string };
  return { client, email, id: user.id };
};

const signIn = async (email: string, password = PASSWORD) => {
  const client = new ApiClient(ctx);
  const res = await client.post('/api/auth/sign-in/email', { email, password });
  remember(client.sessionToken);
  return { client, res };
};

const enableMfa = async (client: ApiClient) => {
  const enabled = await client.post('/api/auth/two-factor/enable', { password: PASSWORD });
  expect(enabled.status).toBe(200);
  const { totpURI, backupCodes } = enabled.body as { totpURI: string; backupCodes: string[] };
  remember(new URL(totpURI).searchParams.get('secret') ?? undefined, ...backupCodes);
  const code = totpFromUri(totpURI);
  remember(code);
  expect((await client.post('/api/auth/two-factor/verify-totp', { code })).status).toBe(200);
  remember(client.sessionToken);
  return { totpURI, backupCodes };
};

const state: {
  owner?: Awaited<ReturnType<typeof signUpAndVerify>>;
  orgA?: string;
  bob?: Awaited<ReturnType<typeof signUpAndVerify>>;
  admin?: ApiClient;
  banned?: string;
} = {};

describe('API end-to-end journeys', () => {
  it('E2E-JOURNEY-01 sign-up, verification from Mailpit, organization creation', async () => {
    const owner = await signUpAndVerify('olivia');
    const created = await owner.client.post('/api/auth/organization/create', {
      name: 'Acme Security',
      slug: `acme-${run}`,
    });
    expect(created.status).toBe(200);
    const orgId = created.body.id as string;
    const full = await owner.client.get(
      `/api/auth/organization/get-full-organization?organizationId=${orgId}`,
    );
    expect(full.status).toBe(200);
    expect(full.body.members).toHaveLength(1);
    expect(full.body.members[0]).toMatchObject({ userId: owner.id, role: 'ORG_OWNER' });
    state.owner = owner;
    state.orgA = orgId;
  });

  it('E2E-JOURNEY-02 invitation email, new user sign-up and acceptance', async () => {
    const { owner, orgA } = state;
    const bobEmail = emailOf('bob');
    const invited = await owner!.client.post('/api/auth/organization/invite-member', {
      email: bobEmail,
      role: 'AI_DEVELOPER',
      organizationId: orgA,
    });
    expect(invited.status, JSON.stringify(invited.body)).toBe(200);

    const bob = await signUpAndVerify('bob');
    const invitation = await waitForEmail(ctx, bobEmail, 'invited you to');
    const acceptUrl = extractLink(invitation.Text, `${ctx.webOrigin}/invitations/`);
    const invitationId = acceptUrl.split('/').pop()!;
    const accepted = await bob.client.post('/api/auth/organization/accept-invitation', {
      invitationId,
    });
    expect(accepted.status, `${acceptUrl} ${JSON.stringify(accepted.body)}`).toBe(200);
    const active = await bob.client.get('/api/auth/organization/get-active-member');
    expect(active.body).toMatchObject({ organizationId: orgA, role: 'AI_DEVELOPER' });
    state.bob = bob;
  });

  it('E2E-JOURNEY-03 password reset from Mailpit revokes old sessions', async () => {
    const carol = await signUpAndVerify('carol');
    const anonymous = new ApiClient(ctx);
    const requested = await anonymous.post('/api/auth/request-password-reset', {
      email: carol.email,
      redirectTo: `${ctx.webOrigin}/reset-password`,
    });
    expect(requested.status).toBe(200);
    const message = await waitForEmail(ctx, carol.email, 'Reset your');
    const link = extractLink(message.Text, `${ctx.baseUrl}/api/auth/reset-password/`);
    const redirect = await anonymous.get(pathOf(link));
    expect(redirect.status).toBe(302);
    const token = new URL(redirect.headers.get('location')!).searchParams.get('token')!;
    remember(token);

    const newPassword = 'e2e-brand-new-password';
    remember(newPassword);
    expect((await anonymous.post('/api/auth/reset-password', { token, newPassword })).status).toBe(
      200,
    );
    expect((await carol.client.get('/api/auth/get-session')).body).toBeNull();
    expect((await signIn(carol.email, newPassword)).res.status).toBe(200);
    const reused = await anonymous.post('/api/auth/reset-password', {
      token,
      newPassword: 'e2e-another-password',
    });
    expect(reused.status).toBe(400);
    expect(reused.body.code).toBe('INVALID_TOKEN');
  });

  it('E2E-JOURNEY-04 MFA with TOTP and single-use backup codes', async () => {
    const dana = await signUpAndVerify('dana');
    const { totpURI, backupCodes } = await enableMfa(dana.client);
    await waitForEmail(ctx, dana.email, 'Two-factor authentication enabled');
    expect((await dana.client.post('/api/auth/sign-out')).status).toBe(200);

    const challenge = async (path: string, code: string) => {
      remember(code);
      const { client, res } = await signIn(dana.email);
      expect(res.body).toMatchObject({ twoFactorRedirect: true });
      const verified = await client.post(path, { code });
      remember(client.sessionToken);
      return { client, verified };
    };
    const withTotp = await challenge(
      '/api/auth/two-factor/verify-totp',
      totpFromUri(totpURI, Date.now() + 30_000),
    );
    expect(withTotp.verified.status).toBe(200);
    expect((await withTotp.client.get('/api/auth/get-session')).body.user.id).toBe(dana.id);
    await withTotp.client.post('/api/auth/sign-out');

    const withBackup = await challenge('/api/auth/two-factor/verify-backup-code', backupCodes[0]);
    expect(withBackup.verified.status).toBe(200);
    await withBackup.client.post('/api/auth/sign-out');

    const reused = await challenge('/api/auth/two-factor/verify-backup-code', backupCodes[0]);
    expect(reused.verified.status).toBe(401);
    expect((await reused.client.get('/api/auth/get-session')).body).toBeNull();
  });

  it('E2E-JOURNEY-05 bootstrap admin bans and unbans a user', async () => {
    const ada = await signUpAndVerify('ada');
    const promote = spawnSync(
      process.execPath,
      [resolve(__dirname, '../../dist/cli/admin-promote.js'), '--email', ada.email],
      { env: { ...process.env, DATABASE_URL: ctx.databaseUrl }, encoding: 'utf8' },
    );
    expect(promote.status, promote.stderr).toBe(0);
    expect((await ada.client.get('/api/v1/admin/users')).body.error.code).toBe(
      'MFA_ENROLLMENT_REQUIRED',
    );
    await enableMfa(ada.client);

    const bob = await signUpAndVerify('bob5');
    const search = await ada.client.get(`/api/v1/admin/users?q=bob5-${run}`);
    expect(search.status).toBe(200);
    expect((search.body.data as { id: string }[]).map((u) => u.id)).toEqual([bob.id]);

    const ban = await ada.client.put(`/api/v1/admin/users/${bob.id}/ban`, {
      reason: 'E2E credential stuffing source',
      expiresInDays: 1,
    });
    expect(ban.status).toBe(200);
    expect(ban.body.data.banned).toBe(true);
    expect((await bob.client.get('/api/auth/get-session')).body).toBeNull();
    const refused = await signIn(bob.email);
    expect(refused.res.status).toBe(403);
    expect(refused.res.body.code).toBe('BANNED_USER');

    expect((await ada.client.delete(`/api/v1/admin/users/${bob.id}/ban`)).status).toBe(204);
    expect((await signIn(bob.email)).res.status).toBe(200);
    state.admin = ada.client;
    state.banned = bob.id;
  });

  it('E2E-JOURNEY-06 tenant calls follow the path organization, not the active one', async () => {
    const { owner, orgA } = state;
    const created = await owner!.client.post('/api/auth/organization/create', {
      name: 'Beta Labs',
      slug: `beta-${run}`,
    });
    const orgB = created.body.id as string;
    const activeOf = async () =>
      (await owner!.client.get('/api/auth/get-session')).body.session.activeOrganizationId;
    expect(await activeOf()).toBe(orgB);

    const events = await owner!.client.get(`/api/v1/organizations/${orgA}/audit-events?limit=100`);
    expect(events.status).toBe(200);
    expect(
      (events.body.data as { organizationId: string }[]).every((e) => e.organizationId === orgA),
    ).toBe(true);
    await owner!.client.post('/api/auth/organization/set-active', { organizationId: orgA });
    expect(await activeOf()).toBe(orgA);
  });

  it('E2E-008-01 an auditor and a platform admin read the audit trail', async () => {
    const { owner, orgA, bob, admin, banned } = state;
    const member = await owner!.client.get(
      `/api/auth/organization/list-members?organizationId=${orgA}`,
    );
    const bobMember = (member.body.members as { id: string; userId: string }[]).find(
      (m) => m.userId === bob!.id,
    )!;
    const changed = await owner!.client.post('/api/auth/organization/update-member-role', {
      memberId: bobMember.id,
      role: 'AUDITOR',
      organizationId: orgA,
    });
    expect(changed.status).toBe(200);

    const orgLog = await bob!.client.get(`/api/v1/organizations/${orgA}/audit-events?limit=100`);
    expect(orgLog.status).toBe(200);
    const actions = (orgLog.body.data as { action: string }[]).map((e) => e.action);
    expect(actions).toEqual(
      expect.arrayContaining(['org.invitation.created', 'org.member.role_changed']),
    );

    const platformLog = await admin!.get('/api/v1/admin/audit-events?action=admin.user.banned');
    expect((platformLog.body.data as { targetId: string }[]).map((e) => e.targetId)).toContain(
      banned,
    );
  });

  it('SR-11 no secret seen during the journeys appears in the server or worker logs', async () => {
    await new Promise((done) => setTimeout(done, 500));
    const logs = ctx.logFiles.map((file) => readFileSync(file, 'utf8')).join('\n');
    expect(logs.length).toBeGreaterThan(0);
    const leaked = [...secrets].filter((secret) => logs.includes(secret));
    expect(leaked).toEqual([]);
  });
});
