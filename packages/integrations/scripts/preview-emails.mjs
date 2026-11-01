import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

const require = createRequire(import.meta.url);
const { EmailRenderer } = require('../dist/index.js');
const { values } = parseArgs({ options: { out: { type: 'string' } } });
const directory = values.out
  ? resolve(values.out)
  : resolve(import.meta.dirname, '../../../.cache/email-previews');
const name = 'Alex Morgan';
const to = 'alex@example.com';
const jobs = [
  {
    template: 'verify-email',
    variables: {
      name,
      verifyUrl: 'https://app.example.com/verify-email?token=preview-only',
      expiresInHours: 24,
    },
  },
  {
    template: 'reset-password',
    variables: {
      name,
      resetUrl: 'https://app.example.com/reset-password?token=preview-only',
      expiresInMinutes: 30,
    },
  },
  {
    template: 'existing-account',
    variables: {
      name,
      signInUrl: 'https://app.example.com/sign-in',
      resetUrl: 'https://app.example.com/forgot-password',
    },
  },
  {
    template: 'security-notification',
    variables: {
      name,
      eventLabel: 'Password changed',
      occurredAt: '2026-11-01T12:00:00.000Z',
      secureAccountUrl: 'https://app.example.com/account/security',
    },
  },
  {
    template: 'organization-invitation',
    variables: {
      inviterName: 'Olivia Chen',
      organizationName: 'Acme Security',
      roleLabel: 'Security Engineer',
      acceptUrl: 'https://app.example.com/invitations/preview-only',
      expiresAt: '2026-11-08T12:00:00.000Z',
    },
  },
];
await mkdir(directory, { recursive: true });
const renderer = new EmailRenderer();
for (const job of jobs) {
  const message = renderer.render({ ...job, to, dedupeKey: `preview-${job.template}` });
  // Data URLs are confined to browser previews. Delivered emails use CID MIME parts.
  let html = message.html;
  for (const image of message.attachments ?? [])
    html = html.replaceAll(
      `cid:${image.cid}`,
      `data:${image.contentType};base64,${image.content.toString('base64')}`,
    );
  await writeFile(resolve(directory, `${job.template}.html`), html);
  await writeFile(resolve(directory, `${job.template}.txt`), message.text);
}
await writeFile(
  resolve(directory, 'index.html'),
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>REDOVA email previews</title></head><body style="max-width:760px;margin:48px auto;padding:0 24px;font-family:Arial,Helvetica,sans-serif;color:#1e242b;background:#f4f5f7"><h1>REDOVA transactional emails</h1><p>Preview data only. No message is sent. These links do not contain real action tokens.</p><ul>${jobs.map((job) => `<li style="margin:16px 0"><a style="color:#c8102e" href="${job.template}.html">${job.template}</a> · <a style="color:#475467" href="${job.template}.txt">Plain text</a></li>`).join('')}</ul></body></html>`,
);
process.stdout.write(`Email previews saved to ${directory}\n`);
