// [2026-10-29] Criado: captura as telas REAIS do produto (dados fictícios do demo) para o carrossel de LinkedIn — Rafael Brito
// Uso (com o ambiente isolado no ar: scripts/e2e/process-studio-env.sh up):
//   NODE_PATH=<dir c/ playwright> node scripts/carousel/capture.js [outDir]
// Gera PNG/JPEG em <outDir> (padrão: scripts/carousel/shots). Mesmos dados do vídeo (jornada ponta a ponta + processo manual).
// [2026-10-30] Nota: as lâminas 3-4 (asis/tobe/compare) agora são refeitas por capture-extra.js, que neutraliza os campos "Where" do REQ-003
//   (citavam "S/4HANA Utilities"); rodar este script sozinho reintroduz o termo nessas três capturas.
// Decisões: DSF 2 (nítido no celular); banner "MODO DEMO" escondido; cursor falso NÃO é usado (prints limpos).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');

const root = path.resolve(__dirname, '..', '..');
const out = path.resolve(process.argv[2] || path.join(__dirname, 'shots'));
fs.mkdirSync(out, { recursive: true });
const B = process.env.ANCORO_URL || 'http://localhost:5199';
const JOURNEY = ['REQ-001', 'REQ-004', 'REQ-003', 'REQ-002', 'REQ-005', 'REQ-011', 'REQ-019'];
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  // textos AS-IS/TO-BE coerentes (banco e2e descartável) — mesma fonte do vídeo
  try {
    const { PrismaClient } = require(path.join(root, 'backend', 'node_modules', '@prisma', 'client'));
    const db = new PrismaClient({ datasources: { db: { url: 'file:' + path.join(root, 'backend', 'prisma', 'e2e.db').replace(/\\/g, '/') } } });
    const data = JSON.parse(fs.readFileSync(path.join(root, 'scripts', 'demo-video', 'asis-tobe-ia-reqs.json'), 'utf8'));
    for (const [reqId, f] of Object.entries(data)) { const r = await db.requirement.findFirst({ where: { reqId } }); if (r) await db.requirement.update({ where: { id: r.id }, data: f }); }
    await db.$disconnect();
  } catch (e) { console.log('AVISO seed:', String(e.message).split('\n')[0]); }

  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--headless=new', '--hide-scrollbars'] });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1000 }, deviceScaleFactor: 2, locale: 'pt-BR' });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('PAGEERROR', e.message));
  const shot = async (name, target, opts = {}) => { const f = path.join(out, name); await (target || p).screenshot({ path: f, ...opts }); console.log('ok', name); };
  const hideBanner = () => p.evaluate(() => { for (const d of document.querySelectorAll('div.fixed')) if (/MODO DEMO/.test(d.textContent || '') && d.textContent.length < 120) d.style.display = 'none'; });

  await p.goto(B + '/login', { waitUntil: 'domcontentloaded' }); await p.waitForSelector('input[type=email]');
  await p.fill('input[type=email]', 'rafael.brito@ancoro.com'); await p.fill('input[type=password]', 'demo123');
  await p.click('button:has-text("Entrar")'); await p.waitForURL('**/dashboard'); await p.waitForSelector('tbody tr'); await p.waitForTimeout(2500); await hideBanner();

  // 1) painel lateral do REQ-003: AS-IS e TO-BE (dois prints do mesmo painel)
  await p.locator('tbody tr').nth(2).locator('td').nth(1).click();
  await p.waitForSelector('button:has-text("Comparar")'); await sleep(600);
  const panel = { x: 1360, y: 340, width: 420, height: 660 };
  await shot('asis.png', null, { clip: panel });
  await p.getByRole('button', { name: 'TO-BE', exact: true }).first().click(); await sleep(500);
  await shot('tobe.png', null, { clip: panel });

  // 2) comparativo em tela cheia
  await p.locator('button:has-text("Comparar")').first().click(); await sleep(900);
  await shot('compare.jpg', null, { type: 'jpeg', quality: 90 });
  await p.locator('button[aria-label="Fechar"]').first().click(); await sleep(300);

  // 3) diálogo de geração com a jornada marcada
  await p.locator('button:has-text("Processos"), a:has-text("Processos")').first().click();
  await p.waitForURL('**/processes'); await p.waitForSelector('[data-testid="generate-open"]'); await hideBanner();
  await p.click('[data-testid="generate-open"]'); await p.waitForSelector('input[data-req="REQ-003"]');
  for (const id of JOURNEY) await p.locator(`input[data-req="${id}"]`).check();
  await p.fill('[data-testid="generate-name"]', 'Jornada do cliente: da adesão à leitura'); await sleep(400);
  await shot('generate-dialog.png', p.locator('[data-testid="generate-dialog"] > div').first());

  // 4) processo gerado (visão geral e zoom)
  await p.click('[data-testid="generate-confirm"]');
  await p.waitForURL(/\/processes\/.+/, { timeout: 120000 });
  let fr = await (await p.waitForSelector('iframe[data-testid="process-editor"]')).contentFrame();
  await fr.waitForSelector('svg.canvas .node', { timeout: 30000 }); await sleep(1500);
  await hideBanner();
  await sleep(5000);                                   // espera o aviso (toast) do app sumir — ele aparece sobre o canvas nos prints
  await shot('generated-overview.png', fr.locator('svg.canvas'));
  const box = await fr.locator('svg.canvas').boundingBox();
  // zoom ancorado no 1º gateway (decisão): mostra raias, ramos e rótulos legíveis
  const gwb = await fr.locator('svg.canvas .node[data-kind="gateway"]').first().boundingBox();
  await p.mouse.move(gwb.x + gwb.width / 2, gwb.y + gwb.height / 2);
  await p.mouse.wheel(0, -950); await sleep(1000);
  await shot('generated-zoom.png', fr.locator('svg.canvas'));

  // 5) processo manual (paleta + seta + "+")
  await p.fill('input[placeholder^="Nome do novo"]', 'Aprovação de crédito');
  const before = p.url();
  await p.click('[data-testid="new-process-create"]');
  await p.waitForFunction(u => location.href !== u, before, { timeout: 15000 });
  fr = await (await p.waitForSelector('iframe[data-testid="process-editor"]')).contentFrame();
  await fr.waitForSelector('svg.canvas .node', { timeout: 20000 }); await sleep(600);
  const ids = async () => fr.locator('svg.canvas .node').evaluateAll(ns => ns.map(n => n.getAttribute('data-id')));
  const nodeBox = async id => (await fr.locator(`[data-id="${id}"]`).first().boundingBox());
  const s0 = (await ids())[0];
  let sb = await nodeBox(s0);
  await p.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2); await p.mouse.wheel(0, 270); await sleep(300);
  sb = await nodeBox(s0);
  const y = 560, k = sb.width / 36;
  await p.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2); await p.mouse.down(); await p.mouse.move(640, y, { steps: 18 }); await p.mouse.up(); await sleep(250);
  sb = await nodeBox(s0);
  const step = 165 * k, x0 = sb.x + sb.width / 2;
  const fromPalette = async (tool, label, x, yy) => {
    const b4 = await ids();
    await fr.locator(`[data-tool="${tool}"]`).first().click(); await p.mouse.click(x, yy); await sleep(200);
    const made = (await ids()).find(i => !b4.includes(i));
    if (label) { await p.keyboard.type(label, { delay: 10 }); await p.keyboard.press('Enter'); await sleep(150); }
    return made;
  };
  const quick = async (src, tool, label) => {
    const b4 = await ids();
    await fr.locator(`[data-id="${src}"]`).first().click(); await fr.locator('[data-handle="quick"]').first().click();
    await fr.locator(`[data-quick="${tool}"]`).first().click(); await sleep(200);
    const made = (await ids()).find(i => !b4.includes(i));
    if (label) { await p.keyboard.type(label, { delay: 10 }); await p.keyboard.press('Enter'); await sleep(150); }
    return made;
  };
  const connect = async (a, b) => {
    await fr.locator(`[data-id="${a}"]`).first().click();
    const h = await fr.locator('[data-handle="connect"]').first().boundingBox(); const d = await nodeBox(b);
    await p.mouse.move(h.x + h.width / 2, h.y + h.height / 2); await p.mouse.down();
    await p.mouse.move(d.x + d.width / 2, d.y + d.height / 2, { steps: 14 }); await p.mouse.up(); await sleep(200);
  };
  const t1 = await fromPalette('task-service', 'Consultar crédito', x0 + step, y);
  await connect(s0, t1);
  const g1 = await quick(t1, 'gw-exclusive', 'Crédito aprovado?');
  const c = await fromPalette('task-service', 'Criar contrato', x0 + step * 3, y);
  await connect(g1, c);
  await quick(c, 'end');
  const cb = await nodeBox(c);
  const ann = await fromPalette('annotation', 'Alçada: gerente comercial', cb.x + cb.width / 2 + 30, cb.y - 95);
  await connect(c, ann);
  await p.mouse.click(box.x + 40, box.y + box.height - 30); await sleep(400);   // limpa a seleção
  await shot('manual.png', fr.locator('svg.canvas'));
  await shot('manual-editor.png', p.locator('iframe[data-testid="process-editor"]'));   // editor inteiro: paleta à esquerda + desenho

  // 6) versões (Salvar grava o processo r; versão é um marco com o r)
  const saveVersion = async label => {
    await fr.locator('[data-action="host-versions"]').first().click(); await sleep(400);
    await fr.locator('[data-testid="versions-dialog"] input').first().fill(label);
    await fr.locator('[data-action="version-snapshot"]').first().click(); await sleep(900);
  };
  await fr.locator('[data-action="host-save"]').first().click(); await sleep(900);
  await saveVersion('Versão inicial');
  await fr.locator('[data-testid="versions-dialog"] .modal-actions button').first().click(); await sleep(300);
  await fromPalette('annotation', 'Revisado pelo comercial', cb.x + cb.width / 2 - 120, cb.y + cb.height + 80);
  await fr.locator('[data-action="host-save"]').first().click(); await sleep(900);
  await saveVersion('Aprovado pelo cliente');
  await sleep(500);
  await shot('versions.png', fr.locator('[data-testid="versions-dialog"] .modal').first());

  await browser.close();
  console.log('prints em', out);
})().catch(e => { console.error(e); process.exit(1); });
