// Conventional Commits rules — see docs/GIT-STRATEGY.md §4.
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-empty': [2, 'never'],
    'scope-enum': [
      2,
      'always',
      [
        'server',
        'worker',
        'web',
        'auth',
        'contracts',
        'core',
        'db',
        'integrations',
        'queue',
        'infra',
        'ci',
        'docs',
        'deps',
        'repo',
      ],
    ],
    'header-max-length': [2, 'always', 72],
    // subject-case: keep config-conventional's default so identifiers such as ORG_OWNER stay allowed.
    'trailer-exists': [2, 'never', 'Co-authored-by:'],
  },
};
