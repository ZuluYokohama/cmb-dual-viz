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
await new Promise((r) => setTimeout(r, 3000));

// Enable DEMO dual-logical if checkbox present
await page.evaluate(() => {
  const cb = document.querySelector('.perf-mode input[type=checkbox]');
  if (cb && !cb.checked) cb.click();
});
await new Promise((r) => setTimeout(r, 2500));

// Trigger correlate
await page.evaluate(() => {
  const b = document.querySelector('.correlate-panel .btn.primary, button.primary');
  if (b) b.click();
});
await new Promise((r) => setTimeout(r, 1500));

const info = await page.evaluate(() => {
  const perf = document.querySelector('.perf-panel');
  const hw = document.querySelector('.perf-hw-gate');
  const footer = document.querySelector('.footer p')?.textContent ?? '';
  return {
    hasPerfPanel: !!perf,
    perfText: perf?.textContent?.slice(0, 400) ?? '',
    hwText: hw?.textContent?.slice(0, 200) ?? '',
    footerHasG3: /G3 scale/i.test(footer),
    footerNoNasaCompliant: /not NASA-compliant/i.test(footer),
    noInventedSpeedup: /no invented|SwiftShader|discrete/i.test(
      (perf?.textContent ?? '') + footer
    ),
  };
});
console.log(JSON.stringify(info, null, 2));

await page.screenshot({
  path: '/workspace/cmb-dual-viz/artifacts/cmb-g3-scale.png',
  fullPage: true,
});
console.log('screenshot → artifacts/cmb-g3-scale.png');
await browser.close();
