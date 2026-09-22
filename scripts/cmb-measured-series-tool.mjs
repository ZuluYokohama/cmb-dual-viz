/** JSONL stdin -> measured JSONL stdout. Each line is limited to 1 MiB. */
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cap = 1024 * 1024;
let temp;
try {
  if (process.argv.length !== 2) throw new Error('Usage: node scripts/cmb-measured-series-tool.mjs < queries.jsonl');
  temp = mkdtempSync(join(tmpdir(), 'cmb-measured-series-tool-'));
  const modulePath = join(temp, 'series-tool.mjs');
  await build({ stdin: { contents: "export { measureMeasuredSeriesQuery } from './src/ingest/measuredSeriesTool';", resolveDir: root },
    bundle: true, platform: 'node', format: 'esm', outfile: modulePath, logLevel: 'silent' });
  const { measureMeasuredSeriesQuery } = await import(pathToFileURL(modulePath).href);
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const respond = async raw => {
    if (raw.length > cap) throw new Error('Query line exceeds 1 MiB');
    // Hash the UTF-8 JSON bytes, excluding the LF or CRLF record separator.
    const bytes = raw.at(-1) === 13 ? raw.subarray(0, -1) : raw;
    const start = performance.now();
    const result = measureMeasuredSeriesQuery(JSON.parse(decoder.decode(bytes)));
    const output = JSON.stringify({ ...result, compute_ms: performance.now() - start,
      input_sha256: createHash('sha256').update(bytes).digest('hex') }) + '\n';
    if (!process.stdout.write(output)) await once(process.stdout, 'drain');
  };
  let pending = Buffer.alloc(0);
  for await (const chunk of process.stdin) {
    pending = Buffer.concat([pending, chunk]);
    let newline;
    while ((newline = pending.indexOf(10)) !== -1) {
      await respond(pending.subarray(0, newline));
      pending = pending.subarray(newline + 1);
    }
    if (pending.length > cap) throw new Error('Query line exceeds 1 MiB');
  }
  if (pending.length) await respond(pending);
} catch (error) {
  console.error(`MEASURED_SERIES_QUERY_REJECTED: ${error.message}`);
  process.exitCode = 1;
  process.stdin.destroy();
} finally {
  if (temp) rmSync(temp, { recursive: true, force: true });
}
