import { Writable } from 'node:stream';
import {
  BadRequestException,
  Controller,
  Get,
  type INestApplication,
  Logger as NestLogger,
  Res,
} from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import { Logger, PARAMS_PROVIDER_TOKEN, PinoLogger } from 'nestjs-pino';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ApiExceptionFilter } from '../common/api-exception.filter';
import { EnvelopeInterceptor } from '../common/envelope.interceptor';
import { requestContextMiddleware } from '../common/request-context';
import { HttpLoggingService } from './http-logging.service';
import { LoggingModule } from './logging.module';
import { buildPinoHttpOptions, type LoggingEnv } from './pino.config';

@Controller()
class LoggingProbeController {
  private readonly logger = new NestLogger(LoggingProbeController.name);

  constructor(private readonly pino: PinoLogger) {}

  @Get('probe')
  async probe() {
    await Promise.resolve();
    this.pino.assign({ operation: 'probe' });
    this.logger.log({ event: 'probe.completed' }, 'Probe completed');
    return { ok: true };
  }

  @Get('boom')
  boom(): never {
    throw new TypeError('Logging probe failure');
  }

  @Get('bad-request')
  badRequest(): never {
    throw new BadRequestException('Invalid input');
  }

  @Get('health')
  health() {
    return { status: 'ok' };
  }

  @Get('unhealthy')
  unhealthy(@Res({ passthrough: true }) res: Response) {
    res.status(503);
    return { status: 'degraded' };
  }
}

interface LogLine {
  requestId?: string;
  context?: string;
  msg?: string;
  severity: string;
  req?: { method: string; url: string };
  res?: { statusCode: number };
  responseTime?: number;
  operation?: string;
  err?: { type: string; message: string; stack: string };
}

describe('HTTP logging through Nest and early Express handlers', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  const env: LoggingEnv = {
    NODE_ENV: 'production',
    LOG_LEVEL: 'debug',
    LOG_SERVICE_NAME: 'redova-api',
    LOG_AUTO_LOGGING: true,
  };
  const lines: string[] = [];
  const logs = (): LogLine[] =>
    lines
      .join('')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as LogLine);

  beforeAll(async () => {
    const stream = new Writable({
      write(chunk: Buffer, _encoding, done) {
        lines.push(chunk.toString());
        done();
      },
    });
    const module = await Test.createTestingModule({
      imports: [LoggingModule.forRoot(env)],
      controllers: [LoggingProbeController],
      providers: [
        { provide: APP_FILTER, useClass: ApiExceptionFilter },
        { provide: APP_INTERCEPTOR, useClass: EnvelopeInterceptor },
      ],
    })
      .overrideProvider(PARAMS_PROVIDER_TOKEN)
      .useValue({
        pinoHttp: [buildPinoHttpOptions(env), stream],
        useExisting: true,
        assignResponse: true,
      })
      .compile();
    app = module.createNestApplication({ logger: false });
    app.useLogger(app.get(Logger));
    app.use(requestContextMiddleware);
    app.get(HttpLoggingService).configure(app, env);
    // Simulate Better Auth's early Express handler: it terminates before Nest middleware runs.
    app.use('/api/auth/ok', (_req: Request, res: Response, _next: NextFunction) => {
      new NestLogger('EarlyAuth').log('Early handler completed');
      res.json({ ok: true });
    });
    app.setGlobalPrefix('api/v1');
    await app.init();
    http = request(app.getHttpServer());
  });

  beforeEach(() => {
    lines.length = 0;
    env.LOG_AUTO_LOGGING = true;
  });
  afterAll(async () => {
    await app?.close();
  });

  it('correlates service logs, the response header and the API envelope without duplicate HTTP logs', async () => {
    const response = await http
      .get('/api/v1/probe?token=hidden-query')
      .set('x-request-id', 'probe-123')
      .expect(200);
    expect(response.headers['x-request-id']).toBe('probe-123');
    expect(response.body.meta.requestId).toBe('probe-123');
    const entries = logs();
    expect(entries).toHaveLength(2);
    expect(entries.every((line) => line.requestId === 'probe-123')).toBe(true);
    expect(entries.find((line) => line.context === 'LoggingProbeController')).toMatchObject({
      operation: 'probe',
      msg: 'Probe completed',
    });
    expect(entries.find((line) => line.res)).toMatchObject({
      operation: 'probe',
      req: { method: 'GET', url: '/api/v1/probe' },
      res: { statusCode: 200 },
      severity: 'info',
      responseTime: expect.any(Number),
    });
    expect(lines.join('')).not.toContain('hidden-query');
  });

  it('records early auth requests and their application logs with the same request id', async () => {
    const response = await http
      .get('/api/auth/ok?token=auth-secret')
      .set('authorization', 'Bearer header-secret')
      .expect(200);
    const entries = logs();
    expect(entries).toHaveLength(2);
    expect(entries.every((line) => line.requestId === response.headers['x-request-id'])).toBe(true);
    expect(entries.find((line) => line.res)?.req?.url).toBe('/api/auth/ok');
    expect(lines.join('')).not.toMatch(/auth-secret|header-secret/);
  });

  it('keeps concurrent request contexts isolated', async () => {
    await Promise.all(
      ['concurrent-a', 'concurrent-b'].map((id) =>
        http.get('/api/v1/probe').set('x-request-id', id).expect(200),
      ),
    );
    for (const id of ['concurrent-a', 'concurrent-b']) {
      expect(logs().filter((line) => line.requestId === id)).toHaveLength(2);
    }
  });

  it('records server failures once with the original stack and a masked client response', async () => {
    const response = await http.get('/api/v1/boom').expect(500);
    expect(response.body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(response.body)).not.toContain('Logging probe failure');
    expect(logs()).toHaveLength(1);
    expect(logs()[0]).toMatchObject({
      requestId: response.body.meta.requestId,
      severity: 'error',
      res: { statusCode: 500 },
      err: {
        type: 'TypeError',
        message: 'Logging probe failure',
        stack: expect.stringContaining('TypeError: Logging probe failure'),
      },
    });
  });

  it('records expected client failures as warnings without an error stack', async () => {
    await http.get('/api/v1/bad-request').expect(400);
    expect(logs()).toHaveLength(1);
    expect(logs()[0]).toMatchObject({ severity: 'warn', res: { statusCode: 400 } });
    expect(logs()[0].err).toBeUndefined();
  });

  it('keeps successful health probes at debug and failed probes at error', async () => {
    await http.get('/api/v1/health?token=health-secret').expect(200);
    await http.get('/api/v1/unhealthy').expect(503);
    expect(logs().map((line) => line.severity)).toEqual(['debug', 'error']);
  });

  it('retains server failures when automatic access logs are disabled', async () => {
    env.LOG_AUTO_LOGGING = false;
    await http.get('/api/v1/health').expect(200);
    await http.get('/api/v1/boom').expect(500);
    expect(logs()).toHaveLength(1);
    expect(logs()[0]).toMatchObject({
      severity: 'error',
      err: { message: 'Logging probe failure' },
    });
  });
});
