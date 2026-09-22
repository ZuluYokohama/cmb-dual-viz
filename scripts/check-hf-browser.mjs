/** Real file-picker and rejection smoke test; starts its own built-app preview. */
import puppeteer from 'puppeteer-core';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
const [runPath, executablePath] = process.argv.slice(2);
if (!runPath || !executablePath) throw new Error('Usage: node scripts/check-hf-browser.mjs RUN_DIR CHROMIUM_PATH');
const run = resolve(runPath);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(join(tmpdir(), 'cmb-browser-test-'));
const errors = [];
let browser;
let server;
const report = { status: 'FAIL', checks: [], errors, physicalGpu: 'NOT_RUN' };
try {
  server = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', '5175', '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolveReady, reject) => {
    const timer = setTimeout(() => reject(new Error('Preview startup timeout')), 15000);
    server.stdout.on('data', data => { if (data.toString().includes('Local:')) { clearTimeout(timer); resolveReady(); } });
    server.once('error', error => { clearTimeout(timer); reject(error); });
    server.once('exit', code => { clearTimeout(timer); reject(new Error(`Preview exited: ${code}`)); });
  });
  browser = await puppeteer.launch({ executablePath, headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'], defaultViewport: { width: 1440, height: 1100 } });
  report.browser = await browser.version();
  const page = await browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:5175/', { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForSelector('.dataset-row');
  const before = await page.$$eval('.dataset-row', nodes => nodes.length);
  const picker = await page.$('.ingest-panel input[type=file]');
  await picker.uploadFile(join(run, 'planck-staged/dataset.cmb.json'), join(run, 'sunspots-staged/dataset.cmb.json'));
  await page.waitForFunction(n => document.querySelectorAll('.dataset-row').length === n + 2, { timeout: 30000 }, before);
  const imported = await page.$$eval('.dataset-row', nodes => nodes.map(n => n.textContent));
  if (!imported.some(s => s.includes('1653 sky')) || !imported.some(s => s.includes('365 series'))) throw new Error('Imported counts missing from UI');
  report.checks.push({ name: 'actual HF file imports and row counts', status: 'PASS', importedDatasets: 2 });
  const raw = JSON.parse(readFileSync(join(run, 'sunspots-staged/dataset.cmb.json'), 'utf8'));
  raw.records[0].value = null;
  const bad = join(tmp, 'invalid.cmb.json');
  writeFileSync(bad, JSON.stringify(raw));
  await picker.uploadFile(bad);
  await page.waitForFunction(() => [...document.querySelectorAll('.ingest-log .log-rejected')].some(e => e.textContent.includes('expected finite numeric value')), { timeout: 10000 });
  const after = await page.$$eval('.dataset-row', nodes => nodes.length);
  if (after !== before + 2) throw new Error('Rejected input changed dataset count');
  report.checks.push({ name: 'invalid typed row rejected without dataset admission', status: 'PASS' });
  await page.click('.correlate-panel .btn.primary');
  await page.waitForFunction(() => document.querySelector('.correlate-panel')?.textContent.includes('Scanned '), { timeout: 30000 });
  report.correlate = await page.$eval('.correlate-panel .hint', e => e.textContent);
  report.computeDevice = await page.$eval('.device-pill', e => e.textContent);
  report.checks.push({ name: 'browser correlate scan completes after HF import', status: 'PASS' });
  if (errors.length) throw new Error('Browser runtime exceptions');
  report.checks.push({ name: 'no uncaught browser exceptions', status: 'PASS' });
  await page.screenshot({ path: join(run, 'browser-intake.png'), fullPage: true });
  report.status = 'PASS';
} catch (error) {
  report.failure = error.message;
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (server) server.kill('SIGTERM');
  rmSync(tmp, { recursive: true, force: true });
  writeFileSync(join(run, 'browser-checks.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
