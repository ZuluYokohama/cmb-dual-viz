import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-gpu', '--window-size=1280,1400'],
  defaultViewport: { width: 1280, height: 1400 },
});
const page = await browser.newPage();
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle0', timeout: 60000 });
await page.waitForSelector('.smith-panel', { timeout: 15000 });

await page.evaluate(() => {
  const btns = [...document.querySelectorAll('.url-samples .btn')];
  const b = btns.find((el) => (el.textContent || '').includes('sample remote C'));
  if (b) b.click();
});
await new Promise((r) => setTimeout(r, 1500));

await page.evaluate(() => {
  const b = document.querySelector('.correlate-panel .btn.primary');
  if (b) b.click();
});
await new Promise((r) => setTimeout(r, 1200));

await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.correlate-table tbody tr')];
  const row = rows.find((r) => r.querySelectorAll('td').length >= 5);
  if (row) row.click();
});
await new Promise((r) => setTimeout(r, 600));

// Scroll smith into view then capture full page crop of main content
await page.evaluate(() => {
  document.querySelector('.smith-row')?.scrollIntoView({ block: 'center' });
});
await new Promise((r) => setTimeout(r, 300));

const hits = await page.evaluate(() => {
  return [...document.querySelectorAll('.correlate-table tbody tr')].map((r) =>
    r.innerText.replace(/\s+/g, ' ').trim()
  );
});
console.log('hits', hits.slice(0, 5));

await page.screenshot({
  path: '/workspace/cmb-dual-viz/artifacts/cmb-smith-v3.png',
  fullPage: true,
});
console.log('screenshot ok');
await browser.close();
