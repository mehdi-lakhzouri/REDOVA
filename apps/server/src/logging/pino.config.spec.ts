import { Writable } from 'node:stream';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { getOrCreateRequestId } from '../common/request-context';
import { buildPinoHttpOptions, type LoggingEnv } from './pino.config';

const env: LoggingEnv = {
  NODE_ENV: 'production',
  LOG_LEVEL: 'info',
  LOG_SERVICE_NAME: 'redova-api',
  LOG_AUTO_LOGGING: true,
};

const capture = (overrides: Partial<LoggingEnv> = {}) => {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      lines.push(chunk.toString());
      done();
    },
  });
  return {
    logger: pino(buildPinoHttpOptions({ ...env, ...overrides }), stream),
    output: () => lines.join(''),
  };
};

describe('Pino configuration', () => {
  it('emits structured production logs with service, environment and UTC time', () => {
    const { logger, output } = capture();
    logger.info({ operation: 'test' }, 'Operation completed');
    expect(JSON.parse(output())).toMatchObject({
      service: 'redova-api',
      environment: 'production',
      level: 30,
      severity: 'info',
      time: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T.*Z$/),
      msg: 'Operation completed',
      operation: 'test',
    });
  });

  it('redacts credentials at the root, in nested objects and in arrays (AC-001-13)', () => {
    const { logger, output } = capture();
    logger.info({
      password: 'root-password',
      token: 'root-token',
      req: { headers: { cookie: 'session-cookie', authorization: 'Bearer auth-token' } },
      res: { headers: { 'set-cookie': 'response-cookie' } },
      body: {
        passwordHash: 'hashed-password',
        currentPassword: 'current-password',
        newPassword: 'new-password',
        code: '123456',
        credentials: { secret: 'nested-secret', accessToken: 'access-token' },
      },
      records: [{ token: 'array-token', backupCodes: ['backup-code'] }],
      config: { DATABASE_URL: 'postgresql://user:db-password@host/db' },
      email: { variables: { verifyUrl: 'https://example.com?token=verification-token' } },
      context: { headers: { 'set-cookie': 'nested-cookie' } },
    });
    for (const secret of [
      'root-password',
      'root-token',
      'session-cookie',
      'auth-token',
      'response-cookie',
      'hashed-password',
      'current-password',
      'new-password',
      '123456',
      'nested-secret',
      'access-token',
      'array-token',
      'backup-code',
      'db-password',
      'verification-token',
      'nested-cookie',
    ]) {
      expect(output()).not.toContain(secret);
    }
    expect(output()).toContain('[Redacted]');
  });

  it('omits request/response payloads and headers and strips query strings', () => {
    const { logger, output } = capture();
    logger.info({
      req: {
        method: 'POST',
        url: '/api/auth/verify-email?token=query-token#fragment-token',
        headers: { 'x-api-key': 'header-key' },
        body: { arbitraryField: 'sensitive-body' },
      },
      res: { statusCode: 200, headers: { location: 'https://example.com?token=redirect-token' } },
    });
    expect(JSON.parse(output())).toMatchObject({
      req: { method: 'POST', url: '/api/auth/verify-email' },
      res: { statusCode: 200 },
    });
    expect(output()).not.toMatch(
      /query-token|fragment-token|header-key|sensitive-body|redirect-token/,
    );
  });

  it('keeps the error stack without serializing arbitrary error properties', () => {
    const { logger, output } = capture();
    const error = Object.assign(new TypeError('Operation failed'), {
      config: { headers: { authorization: 'client-secret' } },
      response: { data: 'private-response' },
    });
    logger.error({ err: error }, 'Request failed');
    expect(JSON.parse(output()).err).toMatchObject({
      type: 'TypeError',
      message: 'Operation failed',
      stack: expect.stringContaining('TypeError: Operation failed'),
    });
    expect(output()).not.toMatch(/client-secret|private-response/);
  });

  it('masks reset tokens carried in URL paths', () => {
    const { logger, output } = capture();
    logger.info({
      req: { method: 'GET', url: '/api/auth/reset-password/path-token?callbackURL=/' },
    });
    expect(JSON.parse(output()).req.url).toBe('/api/auth/reset-password/[Redacted]');
    expect(output()).not.toContain('path-token');
  });

  it('accepts null or missing errors without breaking logging', () => {
    const { logger, output } = capture();
    expect(() => logger.error({ err: null }, 'No error details')).not.toThrow();
    expect(JSON.parse(output()).err).toBeNull();
  });

  it('respects LOG_LEVEL and silent mode', () => {
    const info = capture();
    info.logger.debug('Hidden');
    expect(info.output()).toBe('');
    const silent = capture({ LOG_LEVEL: 'silent' });
    silent.logger.fatal('Hidden');
    expect(silent.output()).toBe('');
  });

  it('uses pino-pretty only in development and disables HTTP logs in tests', () => {
    expect(buildPinoHttpOptions({ ...env, NODE_ENV: 'development' }).transport).toMatchObject({
      target: 'pino-pretty',
    });
    expect(buildPinoHttpOptions(env).transport).toBeUndefined();
    expect(buildPinoHttpOptions({ ...env, NODE_ENV: 'test' }).autoLogging).toBe(false);
  });
});

describe('request identifiers shared by Pino and the API', () => {
  it('preserves the request context identifier and accepts safe incoming identifiers', () => {
    expect(getOrCreateRequestId({ id: 'existing', headers: { 'x-request-id': 'incoming' } })).toBe(
      'existing',
    );
    expect(getOrCreateRequestId({ headers: { 'x-request-id': 'request-123' } })).toBe(
      'request-123',
    );
  });

  it.each([undefined, 'bad id', 'x'.repeat(129), ['first', 'second']])(
    'generates a UUID for an absent or unsafe header: %s',
    (value) => {
      expect(getOrCreateRequestId({ headers: { 'x-request-id': value } })).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    },
  );
});
