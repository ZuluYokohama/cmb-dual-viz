import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: true,
  args: [
    '--no-sandbox',
    '--enable-unsafe-webgpu',
    '--enable-features=Vulkan,UseSkiaRenderer',
    '--use-angle=swiftshader',
    '--use-gl=angle',
    '--window-size=1280,1800',
  ],
  defaultViewport: { width: 1280, height: 1800 },
});
const page = await browser.newPage();
page.on('pageerror', (err) => console.log('pageerror:', err.message));

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle0', timeout: 90000 });
await page.waitForSelector('.engine-shell, .app', { timeout: 20000 });
await new Promise((r) => setTimeout(r, 2500));

// Trigger correlate (IngestConverge default)
await page.evaluate(() => {
  const b = document.querySelector('.correlate-panel .btn.primary');
  if (b) b.click();
});
await new Promise((r) => setTimeout(r, 2500));

const info = await page.evaluate(() => {
  const perf = document.querySelector('.perf-panel');
  const corr = document.querySelector('.correlate-panel');
  const footer = document.querySelector('.footer p')?.textContent ?? '';
  return {
    corrHint: corr?.querySelector('.hint')?.textContent?.slice(0, 200) ?? '',
    corrNote: corr?.querySelector('.epistemic-note')?.textContent?.slice(0, 220) ?? '',
    perfText: perf?.textContent?.slice(0, 500) ?? '',
    footerHasResidue: /Post-G3 residue|IngestConverge/i.test(footer),
    footerNoNasaCompliant: /not NASA-compliant/i.test(footer),
    hasIngestDefault: /IngestConverge OpGraph/i.test(corr?.textContent ?? ''),
  };
});
console.log(JSON.stringify(info, null, 2));

await page.screenshot({
  path: '/workspace/cmb-dual-viz/artifacts/cmb-residue-closed.png',
  fullPage: true,
});
console.log('screenshot → artifacts/cmb-residue-closed.png');
await browser.close();
