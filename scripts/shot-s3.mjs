import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-gpu', '--window-size=1280,1400'],
  defaultViewport: { width: 1280, height: 1400 },
});
const page = await browser.newPage();
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle0', timeout: 90000 });
await page.waitForSelector('.engine-shell', { timeout: 20000 });
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
await new Promise((r) => setTimeout(r, 1500));

const ulamVisible = await page.evaluate(() => !!document.querySelector('.ulam-panel'));
const title = await page.evaluate(() => document.querySelector('h1')?.textContent ?? '');
console.log({ title, ulamVisible });

await page.screenshot({
  path: '/workspace/cmb-dual-viz/artifacts/cmb-s3-cpu-fabric.png',
  fullPage: true,
});
console.log('screenshot ok → artifacts/cmb-s3-cpu-fabric.png');
await browser.close();
