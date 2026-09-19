import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--enable-unsafe-webgpu', '--use-angle=swiftshader', '--use-gl=angle'],
});
const page = await browser.newPage();
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle0', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2000));
const report = await page.evaluate(async () => {
  const fabric = await import('/src/compute/fabric.ts');
  const gate = await fabric.initComputeFabric();
  const sh = [];
  for (const ellMax of [8, 16, 32]) {
    const times = [];
    await fabric.fabricShSynth({ ellMax, seed: 42, ledger: false });
    for (let i = 0; i < (ellMax >= 32 ? 3 : 5); i++) {
      const t0 = performance.now();
      const out = await fabric.fabricShSynth({ ellMax, seed: 42, ledger: false });
      times.push(performance.now() - t0);
      var device = out.device;
    }
    sh.push({
      ellMax,
      device,
      meanMs: times.reduce((a, b) => a + b, 0) / times.length,
      minMs: Math.min(...times),
      maxMs: Math.max(...times),
      runs: times.length,
    });
  }
  return {
    gate: { device: gate.device, reason: gate.reason, reports: gate.reports },
    sh,
  };
});
console.log(JSON.stringify(report, null, 2));
await browser.close();
