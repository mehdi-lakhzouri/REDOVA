#!/usr/bin/env node
// Validates a branch name against docs/GIT-STRATEGY.md §3.1.
export const BRANCH_PATTERN =
  /^(feat|fix|refactor|perf|test|docs|build|ci|chore|spike|hotfix)\/(um-[0-9]{3}-)?[a-z0-9]+(-[a-z0-9]+)*$/;

const name = process.argv[2] ?? '';
if (!BRANCH_PATTERN.test(name)) {
  console.error(`Invalid branch name "${name}". Expected <type>/um-<nnn>-<description> (docs/GIT-STRATEGY.md §3).`);
  process.exit(1);
}
