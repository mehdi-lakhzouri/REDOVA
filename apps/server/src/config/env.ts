import { resolve } from 'node:path';
import { config } from 'dotenv';
import { z } from 'zod';

const booleanFlag = z.enum(['true', 'false']).transform((value) => value === 'true');

/** Server configuration (README Appendix C.1). Validated once at boot; the process fails fast when invalid. */
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3001),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    LOG_SERVICE_NAME: z.string().trim().min(1).max(100).default('redova-api'),
    LOG_AUTO_LOGGING: booleanFlag.default(true),
    DATABASE_URL: z.url(),
    REDIS_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().min(32, 'must be at least 32 characters'),
    BETTER_AUTH_URL: z.url(),
    WEB_ORIGIN: z.url(),
    HIBP_ENABLED: booleanFlag.default(true),
    RATE_LIMIT_ENABLED: booleanFlag.default(true),
    MEDIA_STORAGE: z.enum(['local', 's3']).default('local'),
    MEDIA_LOCAL_DIR: z.string().min(1).default(resolve(__dirname, '../../.data/media')),
    MEDIA_S3_BUCKET: z.string().min(1).optional(),
    MEDIA_S3_REGION: z.string().min(1).optional(),
    MEDIA_S3_ENDPOINT: z.url().optional(),
    MEDIA_S3_ACCESS_KEY_ID: z.string().min(1).optional(),
    MEDIA_S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    MEDIA_S3_FORCE_PATH_STYLE: booleanFlag.default(false),
  })
  .superRefine((env, ctx) => {
    if (env.MEDIA_STORAGE !== 's3') return;
    for (const field of ['MEDIA_S3_BUCKET', 'MEDIA_S3_REGION'] as const) {
      if (!env[field])
        ctx.addIssue({ code: 'custom', path: [field], message: 'required for S3 storage' });
    }
    if (!!env.MEDIA_S3_ACCESS_KEY_ID !== !!env.MEDIA_S3_SECRET_ACCESS_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['MEDIA_S3_ACCESS_KEY_ID'],
        message: 'provide both S3 credentials or neither (IAM role)',
      });
    }
    if (
      env.NODE_ENV === 'production' &&
      env.MEDIA_S3_ENDPOINT &&
      !env.MEDIA_S3_ENDPOINT.startsWith('https://')
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['MEDIA_S3_ENDPOINT'],
        message: 'HTTPS is required in production',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export class InvalidEnvironmentError extends Error {
  constructor(readonly issues: string[]) {
    super(
      `Invalid environment configuration:\n${issues.map((issue) => `  - ${issue}`).join('\n')}`,
    );
    this.name = 'InvalidEnvironmentError';
  }
}

export const parseEnv = (source: NodeJS.ProcessEnv): Env => {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new InvalidEnvironmentError(
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }
  return result.data;
};

/** Local development reads the shared root .env; other environments inject variables directly. */
export const loadDotEnv = (): void => {
  config({ path: resolve(__dirname, '../../../../.env'), quiet: true });
};
