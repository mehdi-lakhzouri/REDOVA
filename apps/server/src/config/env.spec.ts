import { describe, expect, it } from 'vitest';
import { InvalidEnvironmentError, parseEnv } from './env';

const valid = {
  DATABASE_URL: 'postgresql://redova:redova@localhost:5433/redova',
  REDIS_URL: 'redis://localhost:6380',
  BETTER_AUTH_SECRET: 'a'.repeat(32),
  BETTER_AUTH_URL: 'http://localhost:3001',
  WEB_ORIGIN: 'http://localhost:3000',
};

describe('environment schema (UT-001-05)', () => {
  it('applies defaults', () => {
    expect(parseEnv(valid)).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3001,
      LOG_LEVEL: 'info',
      LOG_SERVICE_NAME: 'redova-api',
      LOG_AUTO_LOGGING: true,
      HIBP_ENABLED: true,
      RATE_LIMIT_ENABLED: true,
    });
  });

  it('parses boolean flags', () => {
    expect(parseEnv({ ...valid, HIBP_ENABLED: 'false' }).HIBP_ENABLED).toBe(false);
    expect(parseEnv({ ...valid, LOG_AUTO_LOGGING: 'false' }).LOG_AUTO_LOGGING).toBe(false);
  });

  it.each([
    ['missing secret', { BETTER_AUTH_SECRET: undefined }, 'BETTER_AUTH_SECRET'],
    ['short secret', { BETTER_AUTH_SECRET: 'short' }, 'BETTER_AUTH_SECRET'],
    ['invalid URL', { WEB_ORIGIN: 'not a url' }, 'WEB_ORIGIN'],
    ['invalid flag', { HIBP_ENABLED: 'yes' }, 'HIBP_ENABLED'],
    ['invalid log level', { LOG_LEVEL: 'verbose' }, 'LOG_LEVEL'],
    ['empty log service', { LOG_SERVICE_NAME: '  ' }, 'LOG_SERVICE_NAME'],
    ['invalid HTTP logging flag', { LOG_AUTO_LOGGING: 'yes' }, 'LOG_AUTO_LOGGING'],
  ])('rejects a %s and names the variable', (_label, override, variable) => {
    expect(() => parseEnv({ ...valid, ...override })).toThrow(InvalidEnvironmentError);
    try {
      parseEnv({ ...valid, ...override });
    } catch (error) {
      expect((error as InvalidEnvironmentError).message).toContain(variable);
    }
  });
});
