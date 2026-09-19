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
    '--window-size=1280,2200',
  ],
  defaultViewport: { width: 1280, height: 2200 },
});
const page = await browser.newPage();
page.on('pageerror', (err) => console.log('pageerror:', err.message));

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle0', timeout: 90000 });
await page.waitForSelector('.dressing-panel', { timeout: 20000 });
await new Promise((r) => setTimeout(r, 2000));

// Run correlate then bulk-mark dressed_candidate
await page.evaluate(() => {
  const b = document.querySelector('.correlate-panel .btn.primary');
  if (b) b.click();
});
await new Promise((r) => setTimeout(r, 2500));
await page.evaluate(() => {
  const b = [...document.querySelectorAll('.dressing-panel button')].find((el) =>
    /Mark correlate hits/i.test(el.textContent ?? '')
  );
  if (b && !b.disabled) b.click();
});
await new Promise((r) => setTimeout(r, 800));

// Assert an invariant_claim on a non-scaffold row if possible
await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.dressing-row')];
  for (const row of rows) {
    const pill = row.querySelector('.dress-pill')?.textContent ?? '';
    if (/scaffolding/i.test(pill)) continue;
    const inv = [...row.querySelectorAll('button')].find((el) =>
      /invariant_claim/i.test(el.textContent ?? '')
    );
    if (inv) {
      inv.click();
      break;
    }
  }
});
await new Promise((r) => setTimeout(r, 400));

// Scroll sidebar so Dressing checklist is visible
await page.evaluate(() => {
  const panel = document.querySelector('.dressing-panel');
  const side = document.querySelector('.sidebar');
  if (panel && side) {
    side.scrollTop = panel.offsetTop - 40;
    panel.scrollIntoView({ block: 'start', behavior: 'instant' });
  }
});
await new Promise((r) => setTimeout(r, 400));

const info = await page.evaluate(() => {
  const dress = document.querySelector('.dressing-panel');
  const footer = document.querySelector('.footer p')?.textContent ?? '';
  const rect = dress?.getBoundingClientRect();
  return {
    hasPanel: !!dress,
    motif: dress?.querySelector('.dressing-motif')?.textContent?.slice(0, 120) ?? '',
    disclaimer: dress?.querySelector('.dressing-disclaimer')?.textContent?.slice(0, 160) ?? '',
    rowCount: dress?.querySelectorAll('.dressing-row').length ?? 0,
    candidatePills: [...(dress?.querySelectorAll('.dress-pill.dress-candidate') ?? [])].length,
    footerDressing: /Dressing checklist/i.test(footer),
    footerNoNasa: /not NASA-compliant/i.test(footer),
    footerSwift: /SwiftShader/i.test(footer),
    inspectorDress: !!document.querySelector('.node-inspector .dress-pill'),
    panelTop: rect?.top ?? null,
    panelInViewport: rect ? rect.top < window.innerHeight && rect.bottom > 0 : false,
  };
});
console.log(JSON.stringify(info, null, 2));

// Full page + a focused crop of the dressing panel
await page.screenshot({
  path: '/workspace/cmb-dual-viz/artifacts/cmb-dressing-checklist.png',
  fullPage: true,
});

const dressEl = await page.$('.dressing-panel');
if (dressEl) {
  await dressEl.screenshot({
    path: '/workspace/cmb-dual-viz/artifacts/cmb-dressing-checklist-panel.png',
  });
  console.log('panel crop → artifacts/cmb-dressing-checklist-panel.png');
}

console.log('screenshot → artifacts/cmb-dressing-checklist.png');
await browser.close();
