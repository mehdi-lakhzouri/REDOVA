import { Writable } from 'node:stream';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { buildPinoHttpOptions, REDACTED_PATHS } from './logger';

describe('log redaction (AC-001-13)', () => {
  it('removes cookies, authorization headers and credential fields', () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk: Buffer, _encoding, done) {
        lines.push(chunk.toString());
        done();
      },
    });
    const logger = pino({ redact: { paths: REDACTED_PATHS, censor: '[Redacted]' } }, stream);

    logger.info({
      req: { headers: { cookie: 'redova.session_token=abc', authorization: 'Bearer xyz' } },
      res: { headers: { 'set-cookie': 'redova.session_token=def' } },
      body: { password: 'hunter2-hunter2', token: 'reset-token', code: '123456' },
    });

    const output = lines.join('');
    for (const secret of ['abc', 'xyz', 'def', 'hunter2-hunter2', 'reset-token', '123456']) {
      expect(output).not.toContain(secret);
    }
    expect(output).toContain('[Redacted]');
  });

  it('strips query strings (which may carry tokens) from logged URLs', () => {
    const options = buildPinoHttpOptions({ LOG_LEVEL: 'info', NODE_ENV: 'test' });
    const serializeReq = (options.serializers as Record<string, (req: unknown) => { url: string }>)
      .req;
    const serialized = serializeReq({
      id: 'r1',
      method: 'GET',
      url: '/api/auth/verify-email?token=secret',
      headers: {},
    });
    expect(serialized.url).toBe('/api/auth/verify-email');
  });
});
