import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import sharp from 'sharp';
import { createTestApp, WEB_ORIGIN, type TestApp } from './support/test-app';
import { addMember, createOrganization } from './support/organizations';
import { createVerifiedUser, signIn } from './support/factories';
import { countMediaFiles } from './support/media';

describe('organization logo lifecycle and tenant authorization', () => {
  let t: TestApp,
    directory: string,
    organizationId: string,
    owner: string,
    viewer: string,
    outsider: string,
    png: Buffer,
    path: string;
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'redova-logo-http-'));
    t = await createTestApp({ env: { MEDIA_LOCAL_DIR: directory } });
    const organization = await createOrganization(t, 'Logo workspace');
    organizationId = organization.id;
    owner = organization.owner.cookie;
    viewer = (await addMember(t, organizationId, 'VIEWER')).cookie;
    outsider = await signIn(t, await createVerifiedUser(t));
    png = await sharp({ create: { width: 800, height: 400, channels: 4, background: '#ff2d2d' } })
      .png()
      .toBuffer();
  });
  afterAll(async () => {
    await t?.close();
    if (directory) await rm(directory, { recursive: true, force: true });
  });
  const endpoint = () => `/api/v1/organizations/${organizationId}/logo`;
  const upload = (cookie = owner, body = png) =>
    request(t.app.getHttpServer())
      .post(endpoint())
      .set('cookie', cookie)
      .set('origin', WEB_ORIGIN)
      .attach('file', body, { filename: 'logo.png', contentType: 'image/png' });
  it('authorizes before parsing the upload', async () => {
    await upload('').expect(401);
    await upload(outsider).expect(404);
    await upload(viewer).expect(403);
    await request(t.app.getHttpServer())
      .post(endpoint())
      .set('cookie', owner)
      .set('origin', 'https://evil.example')
      .attach('file', png, 'logo.png')
      .expect(403);
  });
  it('uploads normalized private pixels, records the URL and audits the change', async () => {
    const response = await upload().expect(200);
    path = new URL(response.body.data.logo).pathname;
    expect(
      (await t.prisma.organization.findUniqueOrThrow({ where: { id: organizationId } })).logo,
    ).toBe(response.body.data.logo);
    const image = await request(t.app.getHttpServer()).get(path).set('cookie', viewer).expect(200);
    expect(image.headers['cache-control']).toBe('private, no-store');
    expect(image.headers['x-content-type-options']).toBe('nosniff');
    expect(await sharp(image.body as Buffer).metadata()).toMatchObject({
      format: 'webp',
      width: 512,
      height: 256,
    });
    expect(
      await t.prisma.auditEvent.count({ where: { action: 'org.updated', organizationId } }),
    ).toBe(1);
    await request(t.app.getHttpServer()).get(path).set('cookie', outsider).expect(404);
  });
  it('rejects forged files and oversized uploads without replacing the logo', async () => {
    const old = (await t.prisma.organization.findUniqueOrThrow({ where: { id: organizationId } }))
      .logo;
    expect((await upload(owner, Buffer.from('<svg/>')).expect(400)).body.error.code).toBe(
      'ORG_LOGO_INVALID',
    );
    expect(
      (await upload(owner, Buffer.alloc(2 * 1024 * 1024 + 1)).expect(413)).body.error.code,
    ).toBe('ORG_LOGO_TOO_LARGE');
    expect(
      (await t.prisma.organization.findUniqueOrThrow({ where: { id: organizationId } })).logo,
    ).toBe(old);
  });
  it('hides suspended organizations and cleans up failed writes', async () => {
    await t.prisma.organization.update({
      where: { id: organizationId },
      data: { status: 'SUSPENDED' },
    });
    await request(t.app.getHttpServer()).get(path).set('cookie', owner).expect(404);
    await upload().expect(404);
    expect(await countMediaFiles(join(directory, 'organizations', organizationId, 'logos'))).toBe(
      1,
    );
    await t.prisma.organization.update({
      where: { id: organizationId },
      data: { status: 'ACTIVE' },
    });
  });
  it('replaces and removes managed files without exposing stale URLs', async () => {
    const previous = path;
    const response = await upload().expect(200);
    path = new URL(response.body.data.logo).pathname;
    await request(t.app.getHttpServer()).get(previous).set('cookie', owner).expect(404);
    expect(await countMediaFiles(join(directory, 'organizations', organizationId, 'logos'))).toBe(
      1,
    );
    await request(t.app.getHttpServer())
      .delete(endpoint())
      .set('cookie', owner)
      .set('origin', WEB_ORIGIN)
      .expect(204);
    await request(t.app.getHttpServer()).get(path).set('cookie', owner).expect(404);
    await request(t.app.getHttpServer())
      .delete(endpoint())
      .set('cookie', owner)
      .set('origin', WEB_ORIGIN)
      .expect(204);
    expect(await countMediaFiles(join(directory, 'organizations', organizationId, 'logos'))).toBe(
      0,
    );
  });
});
