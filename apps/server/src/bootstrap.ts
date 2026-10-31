import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { requestContextMiddleware } from './common/request-context';
import type { Env } from './config/env';
import { HttpLoggingService } from './logging/http-logging.service';

export const API_PREFIX = 'api/v1';
const DOCS_PATHS = ['/api/v1/docs', '/api/auth/reference'];

/** HTTP setup shared by `main.ts` and the integration tests. */
export const configureApp = (app: INestApplication, env: Env): void => {
  const production = env.NODE_ENV === 'production';
  app.useLogger(app.get(Logger));

  // Must run first so every request — including the Better Auth handler — has a request context.
  app.use(requestContextMiddleware);
  app.get(HttpLoggingService).configure(app, env);

  // API responses are JSON only (README §17.5). Docs UIs (non-production only) load their own scripts.
  const apiHelmet = helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
    },
    referrerPolicy: { policy: 'no-referrer' },
    frameguard: { action: 'deny' },
    strictTransportSecurity: production ? { maxAge: 31_536_000, includeSubDomains: true } : false,
  });
  const docsHelmet = helmet({ contentSecurityPolicy: false, strictTransportSecurity: false });
  app.use((req: Request, res: Response, next: NextFunction) =>
    DOCS_PATHS.some((path) => req.path.startsWith(path))
      ? docsHelmet(req, res, next)
      : apiHelmet(req, res, next),
  );

  app.setGlobalPrefix(API_PREFIX);
  app.enableShutdownHooks();

  if (!production) {
    const config = new DocumentBuilder()
      .setTitle('REDOVA API')
      .setDescription(
        'REDOVA REST API — `{ data, meta, error }` envelope. Auth endpoints: /api/auth/reference',
      )
      .setVersion('v1')
      .addCookieAuth('redova.session_token')
      .build();
    SwaggerModule.setup(
      'api/v1/docs',
      app,
      cleanupOpenApiDoc(SwaggerModule.createDocument(app, config)),
    );
  }
};
