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
    '--window-size=1280,1500',
  ],
  defaultViewport: { width: 1280, height: 1500 },
});
const page = await browser.newPage();
page.on('console', (msg) => {
  const t = msg.text();
  if (/fabric|webgpu|ε|epsilon|GPU|gate/i.test(t)) console.log('console:', t);
});
page.on('pageerror', (err) => console.log('pageerror:', err.message));

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle0', timeout: 90000 });
await page.waitForSelector('.engine-shell', { timeout: 20000 });
await page.waitForSelector('.device-pill', { timeout: 20000 });

// Wait for gate init + first synth
await new Promise((r) => setTimeout(r, 2500));

const info = await page.evaluate(async () => {
  const pill = document.querySelector('.device-pill');
  const device = pill?.getAttribute('data-device') || pill?.textContent || '?';
  const footer = document.querySelector('.footer p')?.textContent ?? '';
  const hasGpu = !!(navigator.gpu);
  let adapterOk = false;
  let gate = null;
  try {
    if (navigator.gpu) {
      const a = await navigator.gpu.requestAdapter();
      adapterOk = !!a;
    }
  } catch (e) {
    adapterOk = false;
  }
  // Read gate from UI note
  const deviceLine = document.querySelector('.device-line')?.textContent ?? '';
  return { device, hasGpu, adapterOk, deviceLine, footerSnippet: footer.slice(0, 280) };
});
console.log(JSON.stringify(info, null, 2));

await page.evaluate(() => {
  const b = document.querySelector('.correlate-panel .btn.primary');
  if (b) b.click();
});
await new Promise((r) => setTimeout(r, 2000));

const afterCorr = await page.evaluate(() => {
  const hint = document.querySelector('.correlate-panel .hint')?.textContent ?? '';
  return { hint };
});
console.log('correlate:', afterCorr);

await page.screenshot({
  path: '/workspace/cmb-dual-viz/artifacts/cmb-g1-webgpu.png',
  fullPage: true,
});
console.log('screenshot ok → artifacts/cmb-g1-webgpu.png');
await browser.close();
