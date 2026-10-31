import type { IncomingMessage } from 'node:http';
import type { Options } from 'pino-http';
import type { Env } from '../config/env';

/** Paths removed from every log line (README §17.3). */
export const REDACTED_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'res.headers["set-cookie"]',
  '*.password',
  '*.currentPassword',
  '*.newPassword',
  '*.token',
  '*.code',
  '*.secret',
  '*.backupCodes',
  '*.totpURI',
];

/** Query strings may carry verification/reset tokens: log the path only. */
const stripQuery = (url: string | undefined): string | undefined => url?.split('?')[0];

export const buildPinoHttpOptions = (env: Pick<Env, 'LOG_LEVEL' | 'NODE_ENV'>): Options => ({
  level: env.LOG_LEVEL,
  genReqId: (req: IncomingMessage) => (req as IncomingMessage & { id?: string }).id ?? 'unknown',
  redact: { paths: REDACTED_PATHS, censor: '[Redacted]' },
  serializers: {
    req: (req: { id: string; method: string; url?: string; headers: Record<string, unknown> }) => ({
      id: req.id,
      method: req.method,
      url: stripQuery(req.url),
      headers: req.headers,
    }),
  },
  autoLogging: env.NODE_ENV !== 'test',
  ...(env.NODE_ENV === 'development'
    ? { transport: { target: 'pino-pretty', options: { singleLine: true } } }
    : {}),
});
