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
  if (!doc.errors.length && (!workflow?.on || !workflow?.jobs)) problems.push('missing "on" or "jobs"');
  for (const [name, job] of Object.entries(workflow?.jobs ?? {})) {
    for (const step of job.steps ?? []) {
      if (step && typeof step.name === 'object') problems.push(`job ${name}: step name parsed as a mapping`);
    }
  }
  if (problems.length) {
    failed = true;
    console.error(`${file}:\n  ${problems.join('\n  ')}`);
  }
}
process.exit(failed ? 1 : 0);
