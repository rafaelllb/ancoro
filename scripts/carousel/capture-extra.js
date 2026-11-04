// [2026-10-30] Criado: capturas das lâminas novas do carrossel — grafo de dependências e "requisito vinculado ao processo" — Rafael Brito
// Uso (ambiente isolado no ar: scripts/e2e/process-studio-env.sh up):
//   NODE_PATH=<dir c/ playwright> node scripts/carousel/capture-extra.js <dir_das_capturas>
// [2026-10-30] Alterado: também refaz asis/tobe/compare (lâminas 3 e 4) porque os campos "Where" do REQ-003 citavam "S/4HANA Utilities",
//   termo que o Rafael pediu para sumir do PDF — aqui o REQ-003 do banco descartável recebe textos neutros antes da captura.
// Por que um script à parte: o capture.js já gerou as 7 capturas aprovadas das lâminas 1-9; aqui só acrescentamos
// graph-full.png (grafo com o REQ-003 selecionado) e req-process.png (aba "Processos" do REQ-003), sem refazer as anteriores.
// O vínculo requisito↔processo só existe depois de gerar um processo com o REQ-003 marcado — por isso repetimos a geração
// (mesma jornada do capture.js). Dados fictícios do demo; banco e2e descartável.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');

const root = path.resolve(__dirname, '..', '..');
const out = path.resolve(process.argv[2] || path.join(__dirname, 'shots'));
fs.mkdirSync(out, { recursive: true });
const B = process.env.ANCORO_URL || 'http://localhost:5199';
const JOURNEY = ['REQ-001', 'REQ-004', 'REQ-003', 'REQ-002', 'REQ-005', 'REQ-011', 'REQ-019'];
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  // mesmos textos AS-IS/TO-BE do capture.js (para o painel do requisito ficar igual ao das outras lâminas)
  try {
    const { PrismaClient } = require(path.join(root, 'backend', 'node_modules', '@prisma', 'client'));
    const db = new PrismaClient({ datasources: { db: { url: 'file:' + path.join(root, 'backend', 'prisma', 'e2e.db').replace(/\\/g, '/') } } });
    const data = JSON.parse(fs.readFileSync(path.join(root, 'scripts', 'demo-video', 'asis-tobe-ia-reqs.json'), 'utf8'));
    for (const [reqId, f] of Object.entries(data)) { const r = await db.requirement.findFirst({ where: { reqId } }); if (r) await db.requirement.update({ where: { id: r.id }, data: f }); }
    // textos neutros nos campos "Where" do REQ-003 do projeto S/4 (aparecem nas lâminas 3 e 4); só no banco descartável
    await db.requirement.updateMany({ where: { reqId: 'REQ-003', project: { name: { contains: 'S/4 HANA Utilities' } } }, data: { where: 'Sistema legado de contratos', whereToBe: 'Plataforma única de contratos' } });
    await db.$disconnect();
  } catch (e) { console.log('AVISO seed:', String(e.message).split('\n')[0]); }

  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--headless=new', '--hide-scrollbars'] });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1000 }, deviceScaleFactor: 2, locale: 'pt-BR' });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('PAGEERROR', e.message));
  const hideBanner = () => p.evaluate(() => { for (const d of document.querySelectorAll('div.fixed')) if (/MODO DEMO/.test(d.textContent || '') && d.textContent.length < 120) d.style.display = 'none'; });

  await p.goto(B + '/login', { waitUntil: 'domcontentloaded' }); await p.waitForSelector('input[type=email]');
  await p.fill('input[type=email]', 'rafael.brito@ancoro.com'); await p.fill('input[type=password]', 'demo123');
  await p.click('button:has-text("Entrar")'); await p.waitForURL('**/dashboard'); await p.waitForSelector('tbody tr'); await p.waitForTimeout(2500); await hideBanner();

  // 0) lâminas 3 e 4: painel AS-IS/TO-BE do REQ-003 e comparativo (mesmos recortes do capture.js)
  await p.locator('tbody tr').nth(2).locator('td').nth(1).click(); await p.waitForSelector('button:has-text("Comparar")'); await sleep(600);
  const panel = { x: 1360, y: 340, width: 420, height: 660 };
  await p.screenshot({ path: path.join(out, 'asis.png'), clip: panel });
  await p.getByRole('button', { name: 'TO-BE', exact: true }).first().click(); await sleep(500);
  await p.screenshot({ path: path.join(out, 'tobe.png'), clip: panel });
  await p.locator('button:has-text("Comparar")').first().click(); await sleep(900);
  await p.screenshot({ path: path.join(out, 'compare.jpg'), type: 'jpeg', quality: 90 });
  await p.locator('button[aria-label="Fechar"]').first().click(); await sleep(300);
  console.log('ok asis/tobe/compare');

  // 1) gera o processo com a jornada (cria os vínculos requisito↔elemento)
  await p.locator('button:has-text("Processos"), a:has-text("Processos")').first().click();
  await p.waitForURL('**/processes'); await p.waitForSelector('[data-testid="generate-open"]'); await hideBanner();
  await p.click('[data-testid="generate-open"]'); await p.waitForSelector('input[data-req="REQ-003"]');
  for (const id of JOURNEY) await p.locator(`input[data-req="${id}"]`).check();
  await p.fill('[data-testid="generate-name"]', 'Jornada do cliente: da adesão à leitura'); await sleep(300);
  await p.click('[data-testid="generate-confirm"]');
  await p.waitForURL(/\/processes\/.+/, { timeout: 120000 });
  const fr = await (await p.waitForSelector('iframe[data-testid="process-editor"]')).contentFrame();
  await fr.waitForSelector('svg.canvas .node', { timeout: 30000 }); await sleep(1500);

  // 2) requisito vinculado ao processo: aba "Processos" do REQ-003 (em quais processos/elementos ele aparece)
  await p.goto(B + '/dashboard', { waitUntil: 'domcontentloaded' }); await p.waitForSelector('tbody tr'); await sleep(1500); await hideBanner();
  await p.locator('tbody tr').nth(2).locator('td').nth(1).click(); await p.waitForSelector('button:has-text("Comparar")'); await sleep(500);
  await p.click('button:has-text("🔀")'); await p.waitForSelector('[data-testid=requirement-processes]'); await sleep(1200);
  await p.screenshot({ path: path.join(out, 'req-process-full.png') });
  await p.screenshot({ path: path.join(out, 'req-process.png'), clip: { x: 1360, y: 340, width: 420, height: 660 } });
  console.log('ok req-process');

  // 3) grafo: zoom no REQ-003 (posição 487,490 no zoom inicial com viewport 1920x1000) e clique → destaca a cadeia
  await p.locator('a:has-text("Grafo"), button:has-text("Grafo")').first().click();
  await p.waitForURL('**/dependency-graph'); await sleep(1500); await hideBanner();
  await p.mouse.move(487, 490); for (let i = 0; i < 6; i++) { await p.mouse.wheel(0, -240); await sleep(220); }
  await sleep(500); await p.mouse.move(487, 490); await p.mouse.down(); await p.mouse.up(); await sleep(1200);
  await p.screenshot({ path: path.join(out, 'graph-full.png') });
  console.log('ok graph-full');

  await browser.close();
  console.log('capturas extras em', out);
})().catch(e => { console.error(e); process.exit(1); });
