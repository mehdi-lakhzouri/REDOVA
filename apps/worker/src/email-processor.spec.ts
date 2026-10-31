import type { EmailJob } from '@redova/contracts';
import { EmailRenderer } from '@redova/integrations';
import type { Job } from 'bullmq';
import pino from 'pino';
import { Writable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { createEmailProcessor, recipientDomain } from './email-processor';

const data: EmailJob = {
  template: 'verify-email',
  to: 'alice@acme.io',
  dedupeKey: 'https://api.redova.io/api/auth/verify-email?token=secret-token',
  variables: {
    name: 'Alice',
    verifyUrl: 'https://api.redova.io/api/auth/verify-email?token=secret-token',
    expiresInHours: 24,
  },
};

describe('email processor', () => {
  it('renders, sends and logs only delivery metadata', async () => {
    const lines: string[] = [];
    const logger = pino(
      { level: 'info' },
      new Writable({
        write(chunk: Buffer, _encoding, done) {
          lines.push(chunk.toString());
          done();
        },
      }),
    );
    const send = vi.fn().mockResolvedValue({ messageId: 'm-1' });
    const process = createEmailProcessor({
      renderer: new EmailRenderer(),
      sender: { send },
      logger,
    });

    await expect(
      process({ id: 'j-1', attemptsMade: 0, data } as unknown as Job<EmailJob>),
    ).resolves.toEqual({ messageId: 'm-1' });

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'alice@acme.io', subject: 'Verify your REDOVA email address' }),
    );
    const output = lines.join('');
    expect(output).toContain('"recipientDomain":"acme.io"');
    expect(output).not.toContain('secret-token');
    expect(output).not.toContain('alice@');
  });

  it('rejects invalid payloads before sending', async () => {
    const send = vi.fn();
    const process = createEmailProcessor({
      renderer: new EmailRenderer(),
      sender: { send },
      logger: pino({ level: 'silent' }),
    });
    await expect(
      process({
        id: 'j-2',
        attemptsMade: 0,
        data: { template: 'verify-email' },
      } as unknown as Job<EmailJob>),
    ).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });

  it('keeps only the recipient domain', () => {
    expect(recipientDomain('bob@example.org')).toBe('example.org');
  });
});
