// [2026-10-29] Criado: renderiza carousel.html em PDF (1 lâmina 1080x1350 por página) + PNGs de conferência — Rafael Brito
// Uso: NODE_PATH=<dir c/ playwright> node scripts/carousel/render.js <dir_com_carousel.html> <saida.pdf>
const { chromium } = require('playwright');
const path = require('path');
const dir = path.resolve(process.argv[2]), pdf = path.resolve(process.argv[3]);
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--headless=new'] });
  const p = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
  await p.goto('file:///' + path.join(dir, 'carousel.html').replace(/\\/g, '/'), { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(600);
  const n = await p.locator('section.slide').count();
  for (let i = 0; i < n; i++) await p.locator('section.slide').nth(i).screenshot({ path: path.join(dir, `slide-${String(i + 1).padStart(2, '0')}.png`) });
  await p.pdf({ path: pdf, width: '1080px', height: '1350px', printBackground: true, preferCSSPageSize: true });
  await browser.close();
  console.log(n, 'lâminas ->', pdf);
})().catch(e => { console.error(e); process.exit(1); });
