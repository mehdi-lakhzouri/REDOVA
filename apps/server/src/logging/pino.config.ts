import { stdTimeFunctions } from 'pino';
import type { Options } from 'pino-http';
import { getOrCreateRequestId } from '../common/request-context';
import type { Env } from '../config/env';
import { LOG_REDACTION } from './log-redaction';
import {
  requestPath,
  serializeError,
  serializeRequest,
  serializeResponse,
} from './log-serializers';

export type LoggingEnv = Pick<
  Env,
  'LOG_LEVEL' | 'NODE_ENV' | 'LOG_SERVICE_NAME' | 'LOG_AUTO_LOGGING'
>;

export const buildPinoHttpOptions = (env: LoggingEnv): Options => ({
  level: env.LOG_LEVEL,
  base: { service: env.LOG_SERVICE_NAME, environment: env.NODE_ENV, pid: process.pid },
  timestamp: stdTimeFunctions.isoTime,
  formatters: { level: (label, level) => ({ level, severity: label }) },
  redact: LOG_REDACTION,
  genReqId: (req, res) => {
    const requestId = getOrCreateRequestId(req);
    res.setHeader('x-request-id', requestId);
    return requestId;
  },
  customProps: (req) => ({ requestId: req.id }),
  serializers: { req: serializeRequest, res: serializeResponse, err: serializeError },
  autoLogging: env.NODE_ENV !== 'test',
  customLogLevel: (req, res, error) => {
    if (error || res.statusCode >= 500) return 'error';
    if (!env.LOG_AUTO_LOGGING) return 'silent';
    if (res.statusCode >= 400) return 'warn';
    // Keep failed probes visible while avoiding one info line per successful health check.
    if (requestPath(req.url)?.replace(/\/$/, '') === '/api/v1/health') return 'debug';
    return 'info';
  },
  customSuccessMessage: () => 'HTTP request completed',
  customErrorMessage: () => 'HTTP request failed',
  ...(env.NODE_ENV === 'development'
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: process.stdout.isTTY === true,
            singleLine: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        },
      }
    : {}),
});
