/** Compare actual engine results with independently generated NumPy/SciPy references. */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (!process.argv[2]) throw new Error('Usage: node scripts/check-hf.mjs RUN_DIRECTORY');
const out = resolve(process.argv[2]);
const read = name => JSON.parse(readFileSync(join(out, name), 'utf8'));
const reference = read('references.json');
const temp = mkdtempSync(join(tmpdir(), 'cmb-hf-check-'));
const results = [];
function check(name, error, tolerance, details = {}) {
  results.push({ name, maxAbsoluteError: error, tolerance, status: Number.isFinite(error) && error <= tolerance ? 'PASS' : 'FAIL', ...details });
}
try {
  await build({ stdin: { contents: `export { parseStagingDocument } from './src/ingest/staging';
export { bestLaggedPearson, alignSeries } from './src/math/correlates';
export { realYlm } from './src/math/sphericalHarmonics';
export { stagingSmoke } from './src/ingest/stagingSmoke';`, resolveDir: root },
    bundle: true, platform: 'node', format: 'esm', outfile: join(temp, 'engine.mjs'), logLevel: 'silent' });
  const engine = await import(pathToFileURL(join(temp, 'engine.mjs')).href);
  const sky = engine.parseStagingDocument(read('planck-staged/dataset.cmb.json'), 'hf-planck', 0);
  const sun = engine.parseStagingDocument(read('sunspots-staged/dataset.cmb.json'), 'hf-sunspots', 0);
  if (!sky.ok || !sun.ok) throw new Error('Re-import failed');
  const samples = sky.dataset.skySamples;
  if (samples.length !== reference.sky.length) throw new Error('Sky record count changed');
  let coordinateError = 0, valueError = 0;
  for (let i = 0; i < samples.length; i++) {
    coordinateError = Math.max(coordinateError, Math.abs(samples[i].theta - reference.sky[i].theta), Math.abs(samples[i].phi - reference.sky[i].phi));
    valueError = Math.max(valueError, Math.abs(samples[i].value - reference.sky[i].value));
  }
  check('all sky angles vs independent degree conversion', coordinateError, reference.tolerances.coordinateRadians, { count: samples.length });
  check('all sky SNR values preserved', valueError, reference.tolerances.sourceValues, { count: samples.length });
  const originalSeries = read('sunspots.cmb.json').records;
  if (originalSeries.length !== sun.dataset.series.length) throw new Error('Series record count changed');
  let seriesError = 0;
  originalSeries.forEach((r, i) => { seriesError = Math.max(seriesError, Math.abs(r.t - sun.dataset.series[i].t), Math.abs(r.value - sun.dataset.series[i].value)); });
  check('all daily times and values preserved through staging', seriesError, 0, { count: originalSeries.length });
  for (const c of reference.pearson) {
    const actual = engine.bestLaggedPearson(c.a, c.b, c.maxLag);
    check(c.name, Math.abs(actual.score - c.expected.score), reference.tolerances.pearsonScore,
      { actual, expected: c.expected, lagMatches: actual.lag === c.expected.lag });
    if (actual.lag !== c.expected.lag) results.at(-1).status = 'FAIL';
  }
  const alignment = reference.alignment;
  const actualAlignment = engine.alignSeries(alignment.a, alignment.b, alignment.targetLen);
  let alignmentError = 0;
  for (let j = 0; j < 2; j++) {
    if (actualAlignment[j].length !== alignment.expected[j].length) throw new Error('Alignment length mismatch');
    for (let i = 0; i < actualAlignment[j].length; i++) alignmentError = Math.max(alignmentError, Math.abs(actualAlignment[j][i] - alignment.expected[j][i]));
  }
  check('index interpolation vs NumPy interp', alignmentError, reference.tolerances.alignedValues);
  let harmonicError = 0;
  for (const c of reference.harmonics) harmonicError = Math.max(harmonicError, Math.abs(engine.realYlm(c.ell, c.m, c.theta, c.phi) - c.expected));
  check('real harmonics vs SciPy through ell=64', harmonicError, reference.tolerances.realYlmAbsolute, { count: reference.harmonics.length });
  const smoke = { planck: engine.stagingSmoke(sky.dataset), sunspots: engine.stagingSmoke(sun.dataset) };
  const report = { status: results.every(r => r.status === 'PASS') ? 'PASS' : 'FAIL', checks: results, smoke,
    inferenceCalibration: 'NOT_RUN', physicalGpu: 'NOT_RUN', note: 'Permutation cases check numerical agreement, not significance or a valid scientific null.' };
  writeFileSync(join(out, 'numerical-checks.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`Independent numerical checks: ${report.status} (${results.length} gates)`);
  if (report.status !== 'PASS') process.exitCode = 1;
} finally { rmSync(temp, { recursive: true, force: true }); }
