import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--enable-unsafe-webgpu', '--use-angle=swiftshader', '--use-gl=angle'],
});
const page = await browser.newPage();
page.on('console', (m) => console.log('>', m.text()));
page.on('pageerror', (e) => console.log('PE', e.message));
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle0', timeout: 60000 });
await new Promise((r) => setTimeout(r, 500));
const result = await page.evaluate(async () => {
  const mod = await import('/src/compute/webgpu/index.ts');
  const sh = await import('/src/math/sphericalHarmonics.ts');
  mod.resetWebGpuProbe();
  const probe = await mod.probeWebGpu(true);
  if (!probe.handle) return { err: probe.reason };
  const ellMax = 4;
  const seed = 42;
  const nt = 8, np = 16;
  const { coeffs } = sh.drawCoefficients(ellMax, seed, {});
  const cpu = sh.synthesizeGrid(coeffs, nt, np);
  let gpu;
  try {
    gpu = await mod.shSynthGpu(probe.handle, coeffs, nt, np);
  } catch (e) {
    return { err: String(e), stack: e.stack };
  }
  let maxD = 0, maxI = 0;
  for (let i = 0; i < cpu.length; i++) {
    const d = Math.abs(cpu[i] - gpu.grid[i]);
    if (d > maxD) { maxD = d; maxI = i; }
  }
  const sample = [];
  for (let i = 0; i < 8; i++) sample.push({ i, cpu: cpu[i], gpu: gpu.grid[i], d: Math.abs(cpu[i]-gpu.grid[i]) });
  const theta = (Math.PI * 0.5) / nt;
  const phi = 0;
  let ev = 0;
  for (const c of coeffs) ev += c.a * sh.realYlm(c.ell, c.m, theta, phi);
  return {
    maxD, maxI, sample,
    cpu0: cpu[0], gpu0: gpu.grid[0], ev00: ev,
    nBands: gpu.nBands, nCoeff: coeffs.length,
    adapter: probe.handle.adapterInfo,
  };
});
console.log(JSON.stringify(result, null, 2));
await browser.close();
