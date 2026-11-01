import { describe, expect, it, vi } from 'vitest';
import { createTransport } from 'nodemailer';
import { SmtpEmailSender } from './email-sender';
import { EmailRenderer } from './email-renderer';

const sendMail = vi.hoisted(() => vi.fn());
vi.mock('nodemailer', () => ({ createTransport: vi.fn(() => ({ sendMail })) }));
describe('SMTP inline delivery', () => {
  it('requires STARTTLS on the submission port and passes inline assets to the provider', async () => {
    sendMail.mockResolvedValueOnce({ messageId: 'smtp-message-id' });
    const sender = new SmtpEmailSender({
      NODE_ENV: 'development',
      EMAIL_TRANSPORT: 'smtp',
      EMAIL_FROM: 'REDOVA <sender@example.com>',
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: 587,
      SMTP_SECURE: false,
      SMTP_USER: 'sender@example.com',
      SMTP_PASS: 'test-password',
    });
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
    await expect(sender.send(message)).resolves.toEqual({ messageId: 'smtp-message-id' });
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        requireTLS: true,
        disableFileAccess: true,
        disableUrlAccess: true,
        connectionTimeout: 10_000,
        socketTimeout: 30_000,
      }),
    );
    expect(sendMail).toHaveBeenCalledWith({ from: 'REDOVA <sender@example.com>', ...message });
  });
});
