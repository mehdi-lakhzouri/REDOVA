const shared = {
  rootDir: __dirname,
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': [
      '@swc/jest',
      {
        jsc: {
          parser: { syntax: 'typescript', decorators: true },
          transform: { legacyDecorator: true, decoratorMetadata: true },
          target: 'es2023',
        },
        sourceMaps: 'inline',
      },
    ],
  },
  setupFiles: ['reflect-metadata'],
  clearMocks: true,
  restoreMocks: true,
};

module.exports = {
  projects: [
    { ...shared, displayName: 'unit', testMatch: ['<rootDir>/test/jest/unit/**/*.test.ts'] },
    {
      ...shared,
      displayName: 'integration',
      testMatch: ['<rootDir>/test/jest/integration/**/*.test.ts'],
      globalSetup: '<rootDir>/test/jest/global-setup.cjs',
      testTimeout: 30000,
    },
  ],
  maxWorkers: 1,
  coverageProvider: 'v8',
  coverageDirectory: '<rootDir>/coverage/jest',
  collectCoverageFrom: [
    '<rootDir>/src/**/*.ts',
    '!<rootDir>/src/**/*.spec.ts',
    '!<rootDir>/src/main.ts',
    '!<rootDir>/src/cli/**',
  ],
  coverageReporters: ['text-summary', 'lcov', 'json-summary'],
};
