import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, readdir, rmdir, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import request from 'supertest';
import sharp from 'sharp';
import type { TestApp } from './support/test-app';
import { createTestApp, WEB_ORIGIN } from './support/test-app';
import { api, createVerifiedUser, signIn, uniqueEmail } from './support/factories';
import { addMember, createOrganization } from './support/organizations';
import { AVATAR_MAX_BYTES } from '../src/storage/avatar-storage';

describe('avatar lifecycle over real HTTP and local storage', () => {
  let t: TestApp;
  let directory: string;
  let cookie: string;
  let userId: string;
  let outsider: string;
  let colleague: string;
  let membershipId: string;
  let png: Buffer;
  let currentPath: string;
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'redova-avatar-http-'));
    t = await createTestApp({ env: { AVATAR_LOCAL_DIR: directory } });
    const org = await createOrganization(t, 'Avatar tenant');
    userId = org.owner.id;
    cookie = org.owner.cookie;
    const member = await addMember(t, org.id, 'VIEWER');
    colleague = member.cookie;
    membershipId = member.memberId;
    outsider = await signIn(t, await createVerifiedUser(t));
    png = await sharp({ create: { width: 800, height: 600, channels: 3, background: 'blue' } })
      .png()
      .toBuffer();
  });
  afterAll(async () => {
    await t?.close();
    if (directory) {
      for (const file of await readdir(directory)) await unlink(join(directory, file));
      await rmdir(directory);
    }
  });
  const upload = (body: Buffer = png, name = 'photo.png', type = 'image/png') =>
    request(t.app.getHttpServer())
      .post('/api/v1/users/me/avatar')
      .set('cookie', cookie)
      .set('origin', WEB_ORIGIN)
      .attach('file', body, { filename: name, contentType: type });

  it('rejects unauthenticated upload and read', async () => {
    await request(t.app.getHttpServer())
      .post('/api/v1/users/me/avatar')
      .attach('file', png, 'photo.png')
      .expect(401);
    await request(t.app.getHttpServer()).get('/api/v1/avatars/unknown').expect(401);
    expect(await readdir(directory)).toHaveLength(0);
  });
  it.each([undefined, 'https://evil.example'])(
    'rejects an untrusted or missing origin before upload: %s',
    async (origin) => {
      const req = request(t.app.getHttpServer())
        .post('/api/v1/users/me/avatar')
        .set('cookie', cookie);
      if (origin) req.set('origin', origin);
      await req.attach('file', png, 'photo.png').expect(403);
      expect(await readdir(directory)).toHaveLength(0);
    },
  );
  it('uploads, persists the stable URL and serves normalized private pixels', async () => {
    const response = await upload().expect(200);
    currentPath = new URL(response.body.data.image).pathname;
    expect(response.body.error).toBeNull();
    expect((await t.prisma.user.findUniqueOrThrow({ where: { id: userId } })).image).toBe(
      response.body.data.image,
    );
    const image = await request(t.app.getHttpServer())
      .get(currentPath)
      .set('cookie', cookie)
      .expect(200);
    expect(image.headers['content-type']).toMatch(/image\/webp/);
    expect(image.headers['cache-control']).toBe('private, no-store');
    expect(image.headers.vary).toContain('Cookie');
    expect(await sharp(image.body as Buffer).metadata()).toMatchObject({
      format: 'webp',
      width: 512,
      height: 512,
    });
    expect(
      await t.prisma.auditEvent.count({
        where: { action: 'profile.avatar.updated', actorUserId: userId },
      }),
    ).toBe(1);
  });
  it('permits active co-members but hides images from other tenants', async () => {
    await request(t.app.getHttpServer()).get(currentPath).set('cookie', colleague).expect(200);
    await request(t.app.getHttpServer()).get(currentPath).set('cookie', outsider).expect(404);
    await t.prisma.member.update({ where: { id: membershipId }, data: { status: 'SUSPENDED' } });
    await request(t.app.getHttpServer()).get(currentPath).set('cookie', colleague).expect(404);
  });
  it.each([
    [Buffer.from('<svg onload="alert(1)"/>'), 'attack.svg', 'image/svg+xml'],
    [Buffer.from('forged PNG'), 'photo.png', 'image/png'],
  ])(
    'rejects disallowed or disguised files without replacing the image',
    async (body, name, type) => {
      await upload(body, name, type).expect(400);
      expect(await readdir(directory)).toHaveLength(1);
      await request(t.app.getHttpServer()).get(currentPath).set('cookie', cookie).expect(200);
    },
  );
  it('rejects oversized files with the stable 413 code', async () => {
    const response = await upload(Buffer.alloc(AVATAR_MAX_BYTES + 1)).expect(413);
    expect(response.body.error.code).toBe('AVATAR_TOO_LARGE');
    expect(await readdir(directory)).toHaveLength(1);
  });
  it('rejects missing files and unexpected multipart fields', async () => {
    await request(t.app.getHttpServer())
      .post('/api/v1/users/me/avatar')
      .set('cookie', cookie)
      .set('origin', WEB_ORIGIN)
      .expect(400);
    await request(t.app.getHttpServer())
      .post('/api/v1/users/me/avatar')
      .set('cookie', cookie)
      .set('origin', WEB_ORIGIN)
      .field('userId', 'other-user')
      .attach('file', png, 'photo.png')
      .expect(400);
  });
  it('blocks native Better Auth image updates and signup image injection', async () => {
    const response = await api(t)
      .post('/api/auth/update-user', { image: 'https://evil.example/a.svg' }, cookie)
      .expect(400);
    expect(response.body.code).toBe('AVATAR_MANAGED_BY_SERVER');
    await api(t)
      .post('/api/auth/sign-up/email', {
        name: 'Avatar bypass',
        email: uniqueEmail(),
        password: 'correct-horse-battery-staple',
        image: 'https://evil.example/x',
      })
      .expect(400);
  });
  it('replaces the old object and invalidates its URL', async () => {
    const oldPath = currentPath;
    const response = await upload().expect(200);
    currentPath = new URL(response.body.data.image).pathname;
    expect(currentPath).not.toBe(oldPath);
    await request(t.app.getHttpServer()).get(oldPath).set('cookie', cookie).expect(404);
    expect(await readdir(directory)).toHaveLength(1);
  });
  it('serializes concurrent replacements without deleting the winning image', async () => {
    await Promise.all([upload().expect(200), upload().expect(200), upload().expect(200)]);
    const user = await t.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    currentPath = new URL(user.image!).pathname;
    await request(t.app.getHttpServer()).get(currentPath).set('cookie', cookie).expect(200);
    expect(await readdir(directory)).toHaveLength(1);
  });
  it('deletes idempotently, clears the profile and audits once', async () => {
    for (let i = 0; i < 2; i++)
      await request(t.app.getHttpServer())
        .delete('/api/v1/users/me/avatar')
        .set('cookie', cookie)
        .set('origin', WEB_ORIGIN)
        .expect(204);
    expect((await t.prisma.user.findUniqueOrThrow({ where: { id: userId } })).image).toBeNull();
    expect(await readdir(directory)).toHaveLength(0);
    await request(t.app.getHttpServer()).get(currentPath).set('cookie', cookie).expect(404);
    expect(
      await t.prisma.auditEvent.count({
        where: { action: 'profile.avatar.deleted', actorUserId: userId },
      }),
    ).toBe(1);
  });
  it('enforces the shared Redis limit before parsing files', async () => {
    const key = `redova:avatar:rate:${createHash('sha256').update(userId).digest('hex')}`;
    t.env.RATE_LIMIT_ENABLED = true;
    try {
      for (let i = 0; i < 10; i++) {
        await request(t.app.getHttpServer())
          .post('/api/v1/users/me/avatar')
          .set('cookie', cookie)
          .set('origin', WEB_ORIGIN)
          .expect(400);
      }
      const response = await request(t.app.getHttpServer())
        .post('/api/v1/users/me/avatar')
        .set('cookie', cookie)
        .set('origin', WEB_ORIGIN)
        .expect(429);
      expect(response.body.error.code).toBe('RATE_LIMITED');
      expect(response.headers['retry-after']).toBe('600');
    } finally {
      t.env.RATE_LIMIT_ENABLED = false;
      await t.redis.del(key);
    }
  });
});
