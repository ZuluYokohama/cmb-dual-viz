/** Append sample ingest/correlate/compute ledger lines (from a quick fabric run). */
import { mkdirSync, appendFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const outdir = path.join(root, 'artifacts', '.perf-bundle');
mkdirSync(path.join(root, 'artifacts', 'ledger'), { recursive: true });

await build({
  entryPoints: [path.join(root, 'scripts', 'ledger-entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: path.join(outdir, 'ledger-entry.mjs'),
  logLevel: 'silent',
});

const mod = await import(pathToFileURL(path.join(outdir, 'ledger-entry.mjs')).href);
const lines = mod.dump();
const out = path.join(root, 'artifacts', 'ledger', 's3-assurance.jsonl');
writeFileSync(out, lines.map((r) => JSON.stringify(r)).join('\n') + '\n');
console.log('Wrote', out, 'records=', lines.length);
