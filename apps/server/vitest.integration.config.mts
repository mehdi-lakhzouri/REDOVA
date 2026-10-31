import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['test/**/*.int-spec.ts', 'test/security/**/*.security.spec.ts'],
    globalSetup: ['./test/support/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Server coverage is measured on the integration suite, where the app really runs (README §19.3).
    coverage: {
      enabled: process.env.CI === 'true',
      provider: 'v8',
      include: ['src/**/*.ts'],
      // main.ts and the operator CLIs run in child processes (E2E and CLI tests).
      exclude: ['src/**/*.spec.ts', 'src/main.ts', 'src/cli/**'],
      reportsDirectory: 'coverage/integration',
      reporter: ['text-summary', 'json-summary', 'lcov'],
      thresholds: { lines: 80 },
    },
  },
});
