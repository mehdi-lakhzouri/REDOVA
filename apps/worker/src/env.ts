import { resolve } from 'node:path';
import { config } from 'dotenv';
import { z } from 'zod';

const booleanFlag = z.enum(['true', 'false']).transform((value) => value === 'true');

/** Worker configuration (README Appendix C.1). Validated once at boot. */
export const workerEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  REDIS_URL: z.url(),
  EMAIL_TRANSPORT: z.enum(['smtp', 'api']).default('smtp'),
  EMAIL_FROM: z.string().min(3),
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_SECURE: booleanFlag.default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_API_KEY: z.string().optional(),
  EMAIL_CONCURRENCY: z.coerce.number().int().min(1).max(50).default(5),
});

export type WorkerEnv = z.infer<typeof workerEnvSchema>;

/** Empty strings from .env files mean "unset". */
const withoutEmpty = (source: NodeJS.ProcessEnv) =>
  Object.fromEntries(Object.entries(source).filter(([, value]) => value !== ''));

export const parseWorkerEnv = (source: NodeJS.ProcessEnv): WorkerEnv => {
  const result = workerEnvSchema.safeParse(withoutEmpty(source));
  if (!result.success) {
    const issues = result.error.issues.map(
      (issue) => `  - ${issue.path.join('.')}: ${issue.message}`,
    );
    throw new Error(`Invalid worker environment configuration:\n${issues.join('\n')}`);
  }
  return result.data;
};

export const loadDotEnv = (): void => {
  config({ path: resolve(__dirname, '../../../.env'), quiet: true });
};
