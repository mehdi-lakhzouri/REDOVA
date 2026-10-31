#!/usr/bin/env node
// Parses every GitHub Actions workflow: an invalid file never runs, so CI itself cannot report it.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDocument } from 'yaml';

const dir = '.github/workflows';
let failed = false;
for (const file of readdirSync(dir).filter((name) => /\.ya?ml$/.test(name))) {
  const doc = parseDocument(readFileSync(join(dir, file), 'utf8'));
  const workflow = doc.toJS();
  const problems = [...doc.errors.map((error) => error.message)];
  if (!doc.errors.length && (!workflow?.on || !workflow?.jobs))
    problems.push('missing "on" or "jobs"');
  if (file === 'ci.yml' && workflow?.jobs) {
    for (const name of ['lint-typecheck-unit', 'integration', 'e2e', 'security', 'git-hygiene']) {
      if (workflow.jobs[name]?.name !== name) problems.push(`missing required check: ${name}`);
    }
    const security = workflow.jobs.security;
    for (const command of [
      'pnpm security:audit',
      'pnpm security:secrets',
      'pnpm security:secrets:self-test',
    ]) {
      if (!security?.steps?.some((step) => step.run === command && !step['continue-on-error'])) {
        problems.push(`missing blocking security step: ${command}`);
      }
    }
    if (
      !workflow.jobs.e2e?.steps?.some(
        (step) => step.if === 'failure()' && step.uses?.startsWith('actions/upload-artifact@'),
      )
    ) {
      problems.push('missing E2E failure log artifact');
    }
  }
  for (const [name, job] of Object.entries(workflow?.jobs ?? {})) {
    for (const step of job.steps ?? []) {
      if (step && typeof step.name === 'object')
        problems.push(`job ${name}: step name parsed as a mapping`);
    }
  }
  if (problems.length) {
    failed = true;
    console.error(`${file}:\n  ${problems.join('\n  ')}`);
  }
}
process.exit(failed ? 1 : 0);
