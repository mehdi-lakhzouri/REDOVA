#!/usr/bin/env node
// Same scanner locally and in CI. No credentials are printed or copied from ignored .env files.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';

// Official Gitleaks v8.30.1 image, pinned by digest (not a mutable latest tag).
const IMAGE =
  'ghcr.io/gitleaks/gitleaks@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f';
const root = resolve(import.meta.dirname, '..');
const temporary = mkdtempSync(join(tmpdir(), 'redova-secret-scan-'));
const staging = join(temporary, 'source');
const reports = resolve(root, 'test-results/security');
mkdirSync(staging);
mkdirSync(reports, { recursive: true });

const scan = (command, source, name) => {
  const args = [
    'run',
    '--rm',
    '--env',
    'GIT_CONFIG_COUNT=1',
    '--env',
    'GIT_CONFIG_KEY_0=safe.directory',
    '--env',
    'GIT_CONFIG_VALUE_0=/repo',
    '--volume',
    `${root}:/repo:ro`,
    '--volume',
    `${staging}:/source:ro`,
    '--volume',
    `${reports}:/reports`,
    IMAGE,
    command,
    source,
    '--no-banner',
    '--redact=100',
    '--no-color',
    '--report-format=json',
    `--report-path=/reports/${name}.json`,
  ];
  if (existsSync(join(root, '.gitleaks.toml'))) args.push('--config=/repo/.gitleaks.toml');
  if (existsSync(join(root, '.gitleaksignore')))
    args.push('--gitleaks-ignore-path=/repo/.gitleaksignore');
  if (command === 'git') args.push('--log-opts=--all');
  const result = spawnSync('docker', args, {
    cwd: root,
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error || ![0, 1].includes(result.status)) {
    throw new Error(
      `Gitleaks ${name} could not run. Docker must be available (exit ${result.status}).`,
    );
  }
  const findings = JSON.parse(readFileSync(join(reports, `${name}.json`), 'utf8'));
  console.log(`Gitleaks ${name}: ${findings.length} finding(s), report fully redacted.`);
  return { status: result.status, findings };
};

try {
  if (process.argv.includes('--self-test')) {
    // Generate a disposable fake PAT at runtime, never commit a secret-shaped fixture.
    const marker = ['gh', 'p_'].join('') + randomBytes(18).toString('hex');
    writeFileSync(join(staging, 'planted-secret.txt'), `GITHUB_TOKEN=${marker}\n`);
    const { status, findings } = scan('dir', '/source', 'self-test');
    if (status !== 1 || !findings.some((finding) => finding.RuleID === 'github-pat')) {
      throw new Error('Gitleaks self-test failed: a planted fake credential was not rejected.');
    }
    console.log('Gitleaks self-test passed: the security gate rejects the planted credential.');
  } else {
    const files = spawnSync(
      'git',
      ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
      {
        cwd: root,
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
      },
    );
    if (files.status !== 0) throw new Error('Cannot enumerate repository files.');
    for (const file of files.stdout.split('\0').filter(Boolean)) {
      const source = resolve(root, file);
      const target = resolve(staging, file);
      const targetRelative = relative(staging, target);
      if (targetRelative === '..' || targetRelative.startsWith(`..${sep}`))
        throw new Error('Unsafe repository path.');
      if (!existsSync(source)) continue; // A tracked file may have been deleted in this checkout.
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(source, target);
    }
    const history = scan('git', '/repo', 'history');
    const workingTree = scan('dir', '/source', 'working-tree');
    if (history.status !== 0 || workingTree.status !== 0) process.exitCode = 1;
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 2;
} finally {
  // Only this invocation's known temporary directory may be removed recursively.
  if (
    dirname(temporary) === resolve(tmpdir()) &&
    basename(temporary).startsWith('redova-secret-scan-')
  ) {
    rmSync(temporary, { recursive: true, force: true });
  }
}
