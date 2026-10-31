import { defineConfig } from 'vitest/config';

/** API end-to-end journeys against the built server and worker (README §19.4). */
export default defineConfig({
  test: {
    include: ['test/e2e/**/*.e2e-spec.ts'],
    globalSetup: ['./test/e2e/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
