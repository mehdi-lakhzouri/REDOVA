import { createTransport } from 'nodemailer';
import { describe, expect, it } from 'vitest';
import { EmailRenderer } from './email-renderer';

describe('transactional email MIME', () => {
  it('embeds image bytes with Content-IDs alongside independent HTML and text alternatives', async () => {
    const message = new EmailRenderer().render({
      template: 'verify-email',
      to: 'alice@example.com',
      dedupeKey: 'preview',
      variables: {
        name: 'Alice',
        verifyUrl: 'https://app.example.com/verify-email?token=preview',
        expiresInHours: 24,
      },
    });
    const transport = createTransport({ streamTransport: true, buffer: true, newline: 'unix' });
    const result = await transport.sendMail({ from: 'REDOVA <no-reply@example.com>', ...message });
    const mime = (result.message as Buffer).toString('utf8');
    expect(mime).toContain('multipart/alternative');
    expect(mime).toContain('multipart/related');
    expect(mime).toContain('Content-Type: text/plain; charset=utf-8');
    expect(mime).toContain('Content-Type: text/html; charset=utf-8');
    expect(mime).toContain('Content-ID: <redova-logo@assets.redova>');
    expect(mime).toContain('Content-ID: <redova-account-security@assets.redova>');
    expect(mime).toContain('Content-Disposition: inline; filename=redova-logo-light.png');
    expect(mime).toContain('Content-Type: image/jpeg; name=account-security-light.jpg');
    expect(mime.length).toBeLessThan(60_000);
  });
});
