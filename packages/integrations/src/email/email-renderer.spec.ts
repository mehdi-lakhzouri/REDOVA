import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { EmailJob } from '@redova/contracts';
import { describe, expect, it } from 'vitest';
import { EMAIL_TEMPLATES_DIR, EmailRenderer, sanitizeSubject } from './email-renderer';

const renderer = new EmailRenderer();
const occurredAt = '2026-10-31T12:00:00.000Z';

const samples: EmailJob[] = [
  {
    template: 'verify-email',
    to: 'alice@acme.io',
    dedupeKey: 'k1',
    variables: {
      name: 'Alice',
      verifyUrl: 'https://api.redova.io/api/auth/verify-email?token=t',
      expiresInHours: 24,
    },
  },
  {
    template: 'reset-password',
    to: 'alice@acme.io',
    dedupeKey: 'k2',
    variables: {
      name: 'Alice',
      resetUrl: 'https://api.redova.io/api/auth/reset-password/t',
      expiresInMinutes: 30,
      requestIp: '203.0.113.7',
    },
  },
  {
    template: 'existing-account',
    to: 'alice@acme.io',
    dedupeKey: 'k3',
    variables: {
      name: 'Alice',
      signInUrl: 'https://app.redova.io/sign-in',
      resetUrl: 'https://app.redova.io/forgot-password',
    },
  },
  {
    template: 'security-notification',
    to: 'alice@acme.io',
    dedupeKey: 'k4',
    variables: {
      name: 'Alice',
      eventLabel: 'Password reset',
      occurredAt,
      ipAddress: '203.0.113.7',
      secureAccountUrl: 'https://app.redova.io/account/security',
    },
  },
  {
    template: 'organization-invitation',
    to: 'alice@acme.io',
    dedupeKey: 'k5',
    variables: {
      inviterName: 'Olivia',
      organizationName: 'Acme Security',
      roleLabel: 'AI Developer',
      acceptUrl: 'https://app.redova.io/invitations/inv_123',
      expiresAt: occurredAt,
    },
  },
];

describe('email templates (UT-003-01)', () => {
  it.each(samples.map((job) => [job.template, job] as const))(
    'renders %s (html, text, subject)',
    (_name, job) => {
      const message = renderer.render(job);
      expect(message.to).toBe('alice@acme.io');
      expect(message.subject.length).toBeGreaterThan(0);
      expect(message.html).toContain('REDOVA');
      expect(message.text).toContain('REDOVA');
      expect({
        subject: message.subject,
        html: message.html,
        text: message.text,
      }).toMatchSnapshot();
    },
  );

  it.each(samples.map((job) => [job.template, job] as const))(
    'ends every link of the %s text part at a line break, so it stays clickable',
    (_name, job) => {
      const { text } = renderer.render(job);
      const urls = Object.values(job.variables).filter(
        (value): value is string => typeof value === 'string' && value.startsWith('https://'),
      );
      for (const url of urls) {
        const end = text.indexOf(url) + url.length;
        expect(text.indexOf(url), url).toBeGreaterThanOrEqual(0);
        expect(end === text.length || /\s/.test(text[end]), url).toBe(true);
      }
    },
  );

  it('includes the action URL in both HTML and text parts', () => {
    const message = renderer.render(samples[0]);
    // HTML-escaped (= becomes &#x3D;), which browsers decode in href attributes.
    expect(message.html).toContain('https://api.redova.io/api/auth/verify-email?token&#x3D;t');
    expect(message.text).toContain('https://api.redova.io/api/auth/verify-email?token=t');
  });
});

describe('template safety (UT-003-02, UT-003-03)', () => {
  it('no template uses raw {{{ }}} interpolation', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) walk(path);
        else files.push(path);
      }
    };
    walk(EMAIL_TEMPLATES_DIR);
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) expect(readFileSync(file, 'utf8'), file).not.toContain('{{{');
  });

  it('escapes HTML in user-controlled values and truncates them (AC-003-14)', () => {
    const malicious = '<img src=x onerror=alert(1)>';
    const message = renderer.render({
      ...samples[0],
      variables: { ...samples[0].variables, name: malicious },
    } as EmailJob);
    expect(message.html).toContain('&lt;img src&#x3D;x onerror&#x3D;alert(1)&gt;');
    expect(message.html).not.toContain('<img');

    const long = 'x'.repeat(200);
    const truncated = renderer.render({
      ...samples[0],
      variables: { ...samples[0].variables, name: long },
    } as EmailJob);
    expect(truncated.html).not.toContain(long);
    expect(truncated.html).toContain(`${'x'.repeat(63)}…`);
  });

  it('escapes the organization and inviter names in invitations (UT-005-02)', () => {
    const message = renderer.render({
      ...samples[4],
      variables: {
        ...samples[4].variables,
        inviterName: '<b>Eve</b>',
        organizationName: '<script>x</script>',
      },
    } as EmailJob);
    expect(message.html).not.toContain('<script>');
    expect(message.html).not.toContain('<b>Eve</b>');
    expect(message.html).toContain('&lt;script&gt;');
  });

  it('removes CR/LF from subjects', () => {
    expect(sanitizeSubject('Hello\r\nBcc: victim@example.com')).toBe(
      'Hello Bcc: victim@example.com',
    );
    const message = renderer.render({
      ...samples[3],
      variables: { ...samples[3].variables, eventLabel: 'Reset\r\nBcc: x@evil.example' },
    } as EmailJob);
    expect(message.subject).not.toMatch(/[\r\n]/);
  });

  it('rejects unknown templates', () => {
    expect(() =>
      renderer.render({ ...samples[0], template: 'nope' } as unknown as EmailJob),
    ).toThrow(/Unknown email template/);
  });
});
