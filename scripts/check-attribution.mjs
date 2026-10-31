#!/usr/bin/env node
// Fails when a commit message, PR title or PR body contains AI attribution (docs/GIT-STRATEGY.md §4.5).
// Usage: node scripts/check-attribution.mjs <file> | node scripts/check-attribution.mjs - (reads stdin)
import { readFileSync } from 'node:fs';

export const FORBIDDEN = /co-authored-by:|generated (with|by) .*claude|claude\.com\/claude-code|🤖/i;

const source = process.argv[2] ?? '-';
const text = source === '-' ? readFileSync(0, 'utf8') : readFileSync(source, 'utf8');
const offending = text.split(/\r?\n/).filter((line) => FORBIDDEN.test(line));

if (offending.length > 0) {
  console.error('Forbidden attribution found (docs/GIT-STRATEGY.md §4.5):');
  for (const line of offending) console.error(`  > ${line}`);
  process.exit(1);
}
