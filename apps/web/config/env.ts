import { z } from 'zod';

/**
 * Server-side configuration, validated once when Next.js loads its config. Never import this file
 * from client components: only `NEXT_PUBLIC_*` values reach the browser.
 */
const serverEnvSchema = z.object({
  /** REDOVA API origin. The browser never calls it directly: `/api/*` is proxied (same origin). */
  REDOVA_API_URL: z.url().default('http://localhost:3001'),
  NEXT_PUBLIC_SITE_URL: z.url().default('http://localhost:3000'),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export const parseServerEnv = (source: NodeJS.ProcessEnv): ServerEnv => {
  const result = serverEnvSchema.safeParse({
    REDOVA_API_URL: source.REDOVA_API_URL || undefined,
    NEXT_PUBLIC_SITE_URL: source.NEXT_PUBLIC_SITE_URL || undefined,
  });
  if (!result.success) {
    const issues = result.error.issues.map(
      (issue) => `  - ${issue.path.join('.')}: ${issue.message}`,
    );
    throw new Error(`Invalid web environment configuration:\n${issues.join('\n')}`);
  }
  return result.data;
};
