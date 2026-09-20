/** Reproducible local software gate. Non-software validation stays explicitly pending. */
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'artifacts', 'vv', new Date().toISOString().replace(/[:.]/g, '-'));
mkdirSync(out, { recursive: true });
const checks = [];
for (const command of [['test'], ['run', 'lint'], ['run', 'build']]) {
  const r = spawnSync('npm', command, { cwd: root, encoding: 'utf8', timeout: 180_000, maxBuffer: 8 * 1024 * 1024 });
  const name = command.at(-1);
  const log = `${r.stdout ?? ''}\n${r.stderr ?? ''}\n${r.error?.message ?? ''}`;
  writeFileSync(join(out, `${name}.log`), log);
  checks.push({ command: ['npm', ...command].join(' '), status: r.status === 0 ? 'PASS' : 'FAIL', exitCode: r.status,
    logSha256: createHash('sha256').update(log).digest('hex') });
  console.log(`${name}: ${checks.at(-1).status}`);
}
const report = { schemaVersion: 'cmb.software-vv/v1', at: new Date().toISOString(), node: process.version,
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  workingTreeDirty: !!execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim(),
  lockSha256: createHash('sha256').update(readFileSync(join(root, 'package-lock.json'))).digest('hex'),
  softwareVerification: checks.every(c => c.status === 'PASS') ? 'PASS' : 'FAIL', checks,
  realDataValidation: 'NOT_RUN', physicalGpuValidation: 'NOT_RUN', inferenceCalibration: 'NOT_RUN' };
writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(out);
if (report.softwareVerification !== 'PASS') process.exitCode = 1;
