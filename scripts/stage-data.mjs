/** npm run stage:data -- INPUT --out NEW_DIRECTORY [--mapping MAPPING.json] */
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, existsSync, openSync, readSync, closeSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const cap = 5 * 1024 * 1024;
function readBounded(path) {
  const fd = openSync(path, 'r');
  const buffer = Buffer.alloc(cap + 1);
  let length = 0;
  try {
    while (length < buffer.length) {
      const n = readSync(fd, buffer, length, buffer.length - length, null);
      if (!n) break;
      length += n;
    }
  } finally { closeSync(fd); }
  if (length > cap) throw new Error(`${path}: exceeds 5 MiB`);
  return buffer.subarray(0, length);
}
let temp;
try {
  const [inputPath, ...args] = process.argv.slice(2);
  const flags = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--out', '--mapping'].includes(args[i]) || !args[i + 1] || flags[args[i]]) throw new Error('Expected --out DIR and optional --mapping FILE, once each');
    flags[args[i]] = args[i + 1];
  }
  if (!inputPath || !flags['--out']) throw new Error('Usage: npm run stage:data -- INPUT --out NEW_DIRECTORY [--mapping MAPPING.json]');
  const out = resolve(flags['--out']);
  if (existsSync(out)) throw new Error('Output directory already exists; use a new run directory to preserve evidence');
  const bytes = readBounded(inputPath);
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  temp = mkdtempSync(join(tmpdir(), 'cmb-stage-'));
  await build({ stdin: { contents: "export * from './src/ingest/staging'; export * from './src/ingest/stagingSmoke';", resolveDir: root },
    bundle: true, platform: 'node', format: 'esm', outfile: join(temp, 'stage.mjs'), logLevel: 'silent' });
  const { mapJsonl, parseStagingDocument, stagingSmoke } = await import(pathToFileURL(join(temp, 'stage.mjs')).href);
  let mappingBytes, envelope;
  if (flags['--mapping']) {
    mappingBytes = readBounded(flags['--mapping']);
    envelope = mapJsonl(text, JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(mappingBytes)));
  } else envelope = JSON.parse(text);
  const serialized = JSON.stringify(envelope, null, 2) + '\n';
  if (Buffer.byteLength(serialized) > cap) throw new Error('Mapped envelope exceeds 5 MiB browser intake limit');
  const result = parseStagingDocument(envelope, `stage-${sha(serialized).slice(0, 20)}`, 0);
  if (!result.ok) throw new Error(result.errors.join('\n'));
  const smoke = stagingSmoke(result.dataset);
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  const report = { schemaVersion: 'cmb.staging-report/v1', status: 'VERIFIED_FOR_RESEARCH_INTAKE',
    createdAt: new Date().toISOString(), sourceCommit: git('rev-parse', 'HEAD'), workingTreeDirty: !!git('status', '--porcelain'),
    node: process.version, runnerSha256: sha(readFileSync(fileURLToPath(import.meta.url))),
    implementationSha256: sha(readFileSync(join(temp, 'stage.mjs'))),
    input: { bytes: bytes.length, sha256: sha(bytes) }, mappingSha256: mappingBytes ? sha(mappingBytes) : null,
    envelopeSha256: sha(serialized), records: envelope.records.length, kind: envelope.kind,
    provenance: envelope.provenance, sourceAssertionsVerified: false,
    checks: { contract: 'pass', atomicAdmission: 'pass', downstreamCpuSmoke: smoke },
    scientificValidation: 'NOT_RUN', browserWebGpu: 'NOT_RUN', notes: result.residue };
  // Write only after all gates pass. Exclusive writes cannot replace an earlier run.
  mkdirSync(dirname(out), { recursive: true });
  mkdirSync(out);
  writeFileSync(join(out, 'input.raw'), bytes, { flag: 'wx' });
  if (mappingBytes) writeFileSync(join(out, 'mapping.json'), mappingBytes, { flag: 'wx' });
  writeFileSync(join(out, 'dataset.cmb.json'), serialized, { flag: 'wx' });
  writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(`VERIFIED_FOR_RESEARCH_INTAKE: ${report.records} ${report.kind} records\nImport ${join(out, 'dataset.cmb.json')}\nScientific validation: NOT_RUN`);
} catch (error) {
  console.error(`STAGING_REJECTED: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (temp) rmSync(temp, { recursive: true, force: true });
}
