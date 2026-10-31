import { type DynamicModule, Logger, Module, type ModuleMetadata } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { createAuth } from '@redova/auth';
import type { PrismaClient } from '@redova/db';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import type { Redis } from 'ioredis';
import { ZodValidationPipe } from 'nestjs-zod';
import { AuditModule } from './audit/audit.module';
import { AuditService } from './audit/audit.service';
import { ApiExceptionFilter } from './common/api-exception.filter';
import { EnvelopeInterceptor } from './common/envelope.interceptor';
import type { Env } from './config/env';
import { ENV, PRISMA, REDIS } from './config/tokens';
import { createDevEnqueueEmail } from './email/dev-enqueue-email';
import { HealthController } from './health/health.controller';
import { InfrastructureModule } from './infrastructure/infrastructure.module';
import { LoggingModule } from './logging/logging.module';

const authLogger = new Logger('BetterAuth');

@Module({})
export class AppModule {
  /** `extra` lets integration tests mount test-only modules and controllers. */
  static forRoot(
    env: Env,
    extra: Pick<ModuleMetadata, 'imports' | 'controllers'> = {},
  ): DynamicModule {
    return {
      module: AppModule,
      imports: [
        InfrastructureModule.forRoot(env),
        LoggingModule.forRoot(env),
        AuditModule,
        AuthModule.forRootAsync({
          useFactory: (config: Env, prisma: PrismaClient, redis: Redis, audit: AuditService) => ({
            auth: createAuth({
              prisma,
              redis,
              enqueueEmail: createDevEnqueueEmail(config.NODE_ENV),
              recordAudit: (input) => audit.record(input),
              onAuditError: (error) => authLogger.error({ err: error }, 'Audit hook failed'),
              secret: config.BETTER_AUTH_SECRET,
              baseURL: config.BETTER_AUTH_URL,
              webOrigin: config.WEB_ORIGIN,
              production: config.NODE_ENV === 'production',
              hibpEnabled: config.HIBP_ENABLED,
              rateLimitEnabled: config.RATE_LIMIT_ENABLED,
            }),
          }),
          inject: [ENV, PRISMA, REDIS, AuditService],
        }),
        ...(extra.imports ?? []),
      ],
      controllers: [HealthController, ...(extra.controllers ?? [])],
      providers: [
        { provide: APP_PIPE, useClass: ZodValidationPipe },
        { provide: APP_INTERCEPTOR, useClass: EnvelopeInterceptor },
        { provide: APP_FILTER, useClass: ApiExceptionFilter },
      ],
    };
  }
}
