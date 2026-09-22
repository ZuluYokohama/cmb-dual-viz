import puppeteer from 'puppeteer-core';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';

const [runArg, executablePath] = process.argv.slice(2);
if (!runArg || !executablePath) throw new Error('Usage: node scripts/check-llm-browser.mjs RUN_DIR CHROMIUM');
const run = resolve(runArg), root = resolve(import.meta.dirname, '..');
const tmp = mkdtempSync(join(tmpdir(), 'cmb-llm-browser-'));
let server, browser;
const report = { status: 'FAIL', errors: [], checks: [], physicalGpu: 'NOT_RUN' };
try {
  server = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', '5176', '--strictPort'], {cwd: root, stdio: ['ignore', 'pipe', 'pipe']});
  await new Promise((ready, reject) => {
    const timer = setTimeout(() => reject(new Error('Preview startup timed out')), 15000);
    server.stdout.on('data', d => { if (d.toString().includes('Local:')) { clearTimeout(timer); ready(); } });
    server.once('error', e => { clearTimeout(timer); reject(e); });
    server.once('exit', code => { clearTimeout(timer); reject(new Error(`Preview exited ${code}`)); });
  });
  browser = await puppeteer.launch({executablePath, headless: true, args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']});
  const page = await browser.newPage();
  page.on('pageerror', e => report.errors.push(e.message));
  await page.goto('http://127.0.0.1:5176', {waitUntil: 'networkidle0'});
  const before = await page.$$eval('.dataset-row', rows => rows.length);
  const picker = await page.$('input[aria-label="Import LLM trace"]');
  const records = readFileSync(join(run, 'traces.jsonl'), 'utf8').trim().split('\n');
  await picker.uploadFile(join(run, 'traces.jsonl'));
  await page.waitForFunction(n => document.querySelectorAll('.llm-trace-panel tbody tr').length === n, {}, records.length);
  report.checks.push('real observer trace imports');
  const bad = JSON.parse(records[0]);
  bad.observation.embedding_dim += 1;
  const badPath = join(tmp, 'malformed.jsonl');
  writeFileSync(badPath, records[0] + '\n' + JSON.stringify(bad));
  await picker.uploadFile(badPath);
  await page.waitForSelector('.llm-trace-panel [role=alert]');
  const afterRows = await page.$$eval('.llm-trace-panel tbody tr', rows => rows.length);
  if (afterRows !== records.length) throw new Error('Failed import changed existing state');
  report.checks.push('malformed mixed batch rejected atomically');
  const after = await page.$$eval('.dataset-row', rows => rows.length);
  if (before !== after) throw new Error('LLM import modified astronomy datasets');
  report.checks.push('astronomy inputs remain separate');
  await page.setViewport({width: 390, height: 844});
  if (!(await page.$('.llm-trace-panel'))) throw new Error('Missing mobile panel');
  if (report.errors.length) throw new Error('Uncaught browser exception');
  report.checks.push('no browser exceptions');
  report.status = 'PASS';
  report.records = records.length;
  report.browser = await browser.version();
} catch (e) {
  report.failure = e.message;
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (server) server.kill();
  rmSync(tmp, {recursive: true, force: true});
  writeFileSync(join(run, 'browser-checks.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
