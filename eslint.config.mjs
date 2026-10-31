// @ts-check
// Shared ESLint config for packages/* (apps keep their own configs).
// Import boundaries follow docs/user-management/README.md §3.3.
import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import tenantScope from './scripts/eslint-tenant-scope.mjs';

const forbid = (...packages) => ({
  'no-restricted-imports': [
    'error',
    {
      patterns: packages.map((name) => ({
        group: [name, `${name}/*`],
        message: 'Forbidden by the module dependency rules (README §3.3).',
      })),
    },
  ],
});

export default tseslint.config(
  { ignores: ['**/dist/**', '**/generated/**', '**/*.config.*', 'apps/server/**', 'apps/web/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ['packages/auth/src/**/*.ts', 'packages/db/src/**/*.ts'],
    ignores: ['**/*.spec.ts', '**/*.int-spec.ts'],
    plugins: { redova: tenantScope },
    rules: { 'redova/tenant-scope': 'error' },
  },
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': 'error',
    },
  },
  {
    files: ['packages/contracts/**'],
    rules: forbid(
      '@redova/core',
      '@redova/db',
      '@redova/auth',
      '@redova/queue',
      '@redova/integrations',
      '@prisma/*',
      'better-auth',
    ),
  },
  {
    files: ['packages/core/**'],
    rules: forbid(
      '@redova/db',
      '@redova/auth',
      '@redova/queue',
      '@redova/integrations',
      '@prisma/*',
      'better-auth',
    ),
  },
  {
    files: ['packages/db/**'],
    rules: forbid(
      '@redova/auth',
      '@redova/core',
      '@redova/queue',
      '@redova/integrations',
      'better-auth',
    ),
  },
  {
    files: ['packages/integrations/**'],
    rules: forbid('@redova/auth', '@redova/db', '@redova/queue', 'bullmq'),
  },
  {
    files: ['packages/queue/**'],
    rules: forbid('@redova/auth', '@redova/db', '@redova/integrations'),
  },
  {
    // Structured logger only, so redaction always applies (README §17.3).
    files: ['apps/worker/src/**'],
    rules: { 'no-console': 'error' },
  },
);
