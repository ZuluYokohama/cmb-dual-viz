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
    '--window-size=1280,1600',
  ],
  defaultViewport: { width: 1280, height: 1600 },
});
const page = await browser.newPage();
page.on('pageerror', (err) => console.log('pageerror:', err.message));

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle0', timeout: 90000 });
await page.waitForSelector('.engine-shell, .app', { timeout: 20000 });
await new Promise((r) => setTimeout(r, 2500));

// Trigger correlate for richer UI
await page.evaluate(() => {
  const b = document.querySelector('.correlate-panel .btn.primary, button.primary');
  if (b) b.click();
});
await new Promise((r) => setTimeout(r, 1500));

const info = await page.evaluate(() => {
  const perf = document.querySelector('.perf-panel');
  const pill = document.querySelector('.device-pill');
  const footer = document.querySelector('.footer p')?.textContent ?? '';
  return {
    hasPerfPanel: !!perf,
    perfText: perf?.textContent?.slice(0, 240) ?? '',
    device: pill?.getAttribute('data-device') || pill?.textContent || '?',
    footerHasG2: /G2 fusion/i.test(footer),
    footerNoNasaCompliant: /not NASA-compliant/i.test(footer),
  };
});
console.log(JSON.stringify(info, null, 2));

await page.screenshot({
  path: '/workspace/cmb-dual-viz/artifacts/cmb-g2-fusion.png',
  fullPage: true,
});
console.log('screenshot → artifacts/cmb-g2-fusion.png');
await browser.close();
