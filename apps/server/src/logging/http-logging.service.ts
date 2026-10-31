import { type INestApplication, Injectable } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { PinoLogger } from 'nestjs-pino';
import pinoHttp from 'pino-http';
import { serializeRequest } from './log-serializers';
import { buildPinoHttpOptions, type LoggingEnv } from './pino.config';

/** Better Auth registers an early Express handler, outside Nest's controller middleware chain. */
@Injectable()
export class HttpLoggingService {
  constructor(private readonly logger: PinoLogger) {}

  configure(app: INestApplication, env: LoggingEnv): void {
    const { transport: _transport, ...options } = buildPinoHttpOptions(env);

    // Share the root Pino instance and its transport; never create a second pretty worker.
    app.use(pinoHttp({ ...options, logger: this.logger.logger }));
    app.use((req: Request, _res: Response, next: NextFunction) => {
      // Covers early handlers too. nestjs-pino binds req.log/res.log again for Nest controllers.
      this.logger.runInContext(next, {
        bindings: {
          requestId: req.id,
          req: serializeRequest({ method: req.method, url: req.originalUrl }),
        },
      });
    });
  }
}
