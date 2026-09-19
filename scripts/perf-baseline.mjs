/**
 * Measured CPU perf baseline for SH synth + correlate scan.
 * Writes docs/PERF_BASELINE.md and artifacts/ledger/perf-baseline.jsonl
 */
import { writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const outdir = path.join(root, 'artifacts', '.perf-bundle');
mkdirSync(outdir, { recursive: true });
mkdirSync(path.join(root, 'artifacts', 'ledger'), { recursive: true });

// Bundle compute + math for Node measurement (no DOM)
await build({
  entryPoints: [path.join(root, 'scripts', 'perf-entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: path.join(outdir, 'perf-entry.mjs'),
  sourcemap: false,
  logLevel: 'silent',
});

const mod = await import(pathToFileURL(path.join(outdir, 'perf-entry.mjs')).href);
const report = await mod.runBaseline();

const md = `# CPU Perf Baseline (measured)

**Date:** ${report.atIso}  
**Host:** Node ${process.version} · ${process.platform} ${process.arch}  
**Device:** ${report.device}${report.gpuEnabled ? ' (ε-gate enabled)' : ' (CPU fallback / Node — WebGPU N/A)'}  
**Gate:** ${report.gateReason ?? 'n/a'}

> Values are wall-clock \`performance.now()\` / \`Date.now()\` measurements from this machine.
> Do **not** invent GPU speedup factors. Browser WebGPU timings recorded separately when available.

## Spherical-harmonic synthesis (\`SH_SYNTH\` / \`TP_ELL_BAND\`)

| ℓ max | grid (θ×φ) | runs | mean ms | min ms | max ms |
|------:|------------|-----:|--------:|-------:|-------:|
${report.sh
  .map(
    (r) =>
      `| ${r.ellMax} | ${r.nTheta}×${r.nPhi} | ${r.runs} | ${r.meanMs.toFixed(2)} | ${r.minMs.toFixed(2)} | ${r.maxMs.toFixed(2)} |`
  )
  .join('\n')}

## Correlate batch (\`CORRELATE_BATCH\` / \`TP_PAIR_BLOCK\`)

| n series pts | targets scanned | runs | mean ms | min ms | max ms |
|-------------:|----------------:|-----:|--------:|-------:|-------:|
${report.corr
  .map(
    (r) =>
      `| ${r.n} | ${r.scanned} | ${r.runs} | ${r.meanMs.toFixed(2)} | ${r.minMs.toFixed(2)} | ${r.maxMs.toFixed(2)} |`
  )
  .join('\n')}

## WebGPU (G1)

| Status | Notes |
|--------|-------|
| Node baseline | WebGPU **N/A** — CPU fallback (no \`navigator.gpu\`) |
| ε (SH) | \`EPS_SH_ABS = 0.75\` on seed=42, ℓmax=8 |
| ε (correlate) | \`EPS_CORR_ABS = 5e-4\` on 8×32 pairs + exact lags |

Browser GPU timings: run app with WebGPU-capable Chrome; ledger records \`device: webgpu\` when ε-gate passes.

## Notes

- SH path = \`fabricShSynth\` (parity with \`synthesizeGrid\` on CPU; WGSL on GPU).
- Correlate path = \`fabricCorrelate\` over EXAMPLE C_ℓ + synthetic series seeds.
- Recorded also as JSONL: \`artifacts/ledger/perf-baseline.jsonl\`.
`;

writeFileSync(path.join(root, 'docs', 'PERF_BASELINE.md'), md);
const line = JSON.stringify({
  id: `led-perf-${Date.now()}`,
  at: Date.now(),
  kind: 'perf',
  device: 'cpu',
  epistemic: 'ASSURANCE',
  detail: report,
}) + '\n';
writeFileSync(path.join(root, 'artifacts', 'ledger', 'perf-baseline.jsonl'), line);
console.log(md);
console.log('Wrote docs/PERF_BASELINE.md and artifacts/ledger/perf-baseline.jsonl');
