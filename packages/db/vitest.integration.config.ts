import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.int-spec.ts'],
    globalSetup: ['src/test/global-setup.ts'],
    fileParallelism: false,
  },
});
