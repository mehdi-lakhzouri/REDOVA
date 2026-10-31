import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    // Coverage runs in CI (README §19.3 targets); locally: CI=true pnpm test.
    coverage: {
      enabled: process.env.CI === 'true',
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/index.ts'],
      reporter: ['text-summary', 'json-summary', 'lcov'],
      thresholds: { lines: 85 },
    },
  },
});
