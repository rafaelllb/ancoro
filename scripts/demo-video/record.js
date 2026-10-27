// [2026-10-07] Criado: gravador do vídeo de demonstração do Ancoro — Rafael Brito
// Uso:  NODE_PATH=<dir c/ playwright> node record.js <workDir> [--fast] [--shots]
//   workDir deve conter audio/ (gerado por tts.js). Saída: workDir/frames/*.jpg + timeline.json
// Decisões:
//  - Screencast CDP (JPEG q92) em vez de recordVideo do Playwright: o encoder VP8 padrão borra texto de UI.
//  - Cursor e clique são DOM injetado (headless não renderiza cursor do SO).
//  - Navegação entre páginas sem link na UI (goto) acontece ATRÁS do cartão de setor, para não aparecer.
//  - Ritmo dirigido pela narração: cada beat dura max(ação, duração do áudio + folga). O áudio é
//    posicionado pelos tempos reais registrados em timeline.json (sync garantido na montagem).
//  - Pré-requisito: backend em modo demo sem rate limit (NODE_ENV=development + DEMO_MODE=true).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');

const work = path.resolve(process.argv[2] || '.');
const FAST = process.argv.includes('--fast');
const SHOTS = process.argv.includes('--shots');
// [2026-10-07] Criado: modo --quick = a partir do login, sem fala/legenda, ritmo rápido (sleeps x0.35), cartões curtos
const QUICK = process.argv.includes('--quick');
const B = process.env.ANCORO_URL || 'http://localhost:5180';
const sectors = require('./beats-text.js');
const dur = JSON.parse(fs.readFileSync(path.join(work, 'audio', 'durations.json'), 'utf8'));
const framesDir = path.join(work, 'frames'); fs.rmSync(framesDir, { recursive: true, force: true }); fs.mkdirSync(framesDir, { recursive: true });
if (SHOTS) fs.mkdirSync(path.join(work, 'shots'), { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, FAST ? Math.min(ms, 120) : QUICK ? ms * 0.35 : ms));
const rawSleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- overlays injetados (cursor, ripple, cartão de setor, legenda) ----------
const INIT = () => {
  // [2026-10-19] Criado: o editor do Process Studio roda num <iframe> (mesma origem). Dentro dele não há overlays próprios:
  //   os eventos de mouse são convertidos para coordenadas da página e repassados ao documento topo, que desenha o cursor/ripple.
  //   Sem isso o cursor "congela" ao passar sobre o editor (o documento pai não recebe mousemove sobre o iframe).
  if (window !== window.top) {
    const fwd = k => e => { try { const r = window.frameElement.getBoundingClientRect(); window.top.__fwd && window.top.__fwd(k, e.clientX + r.left, e.clientY + r.top); } catch (_) { /* iframe cross-origin: ignora */ } };
    addEventListener('mousemove', fwd('m'), true); addEventListener('mousedown', fwd('d'), true);
    return;
  }
  const mk = () => {
    if (document.getElementById('__ov')) return;
    const st = document.createElement('style');
    st.textContent = `
#__cur{position:fixed;left:0;top:0;width:28px;height:28px;z-index:2147483647;pointer-events:none;transform:translate(-100px,-100px);filter:drop-shadow(0 2px 3px rgba(0,0,0,.45))}
.__rip{position:fixed;z-index:2147483646;pointer-events:none;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;border:3px solid #14b8a6;animation:__rip .55s ease-out forwards}
@keyframes __rip{to{transform:scale(4.2);opacity:0}}
#__card{position:fixed;inset:0;z-index:2147483645;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;
 background:radial-gradient(1200px 700px at 30% 20%,#12365a 0%,#0b1a30 55%,#070f1d 100%);color:#fff;opacity:0;pointer-events:none;transition:opacity .45s ease;font-family:'Plus Jakarta Sans',Inter,system-ui,sans-serif}
#__card.on{opacity:1;pointer-events:all}
#__card .n{letter-spacing:.35em;color:#5eead4;font-size:22px;font-weight:600}
#__card h1{font-size:84px;margin:0;font-weight:700;letter-spacing:-.02em}
#__card p{font-size:30px;margin:0;color:#a8c3dc;font-weight:400}
#__card .bar{width:120px;height:4px;border-radius:4px;background:linear-gradient(90deg,#14b8a6,#38bdf8);margin:6px 0}
#__cap{position:fixed;left:50%;bottom:34px;transform:translateX(-50%);max-width:1480px;z-index:2147483644;pointer-events:none;
 background:rgba(8,20,38,.9);color:#fff;font:500 26px/1.35 'Plus Jakarta Sans',Inter,system-ui,sans-serif;padding:14px 28px;border-radius:14px;
 text-align:center;box-shadow:0 8px 28px rgba(0,0,0,.35);opacity:0;transition:opacity .25s}
#__cap.on{opacity:1}`;
    document.head.appendChild(st);
    const w = document.createElement('div'); w.id = '__ov';
    w.innerHTML = `<svg id="__cur" viewBox="0 0 24 24"><path d="M3 2l7.5 19 2.7-7.6L21 10.7z" fill="#fff" stroke="#0b1a30" stroke-width="1.6" stroke-linejoin="round"/></svg>
<div id="__card"><div class="n"></div><h1></h1><div class="bar"></div><p></p></div><div id="__cap"></div>`;
    document.documentElement.appendChild(w);
    const cur = document.getElementById('__cur');
    const move = (x, y) => { cur.style.transform = `translate(${x - 4}px,${y - 2}px)`; };
    const rip = (x, y) => { const r = document.createElement('div'); r.className = '__rip'; r.style.left = x + 'px'; r.style.top = y + 'px'; document.documentElement.appendChild(r); setTimeout(() => r.remove(), 700); };
    addEventListener('mousemove', e => move(e.clientX, e.clientY), true);
    addEventListener('mousedown', e => rip(e.clientX, e.clientY), true);
    window.__fwd = (k, x, y) => (k === 'm' ? move(x, y) : rip(x, y)); // [2026-10-19] eventos vindos do iframe do editor
  };
  window.__card = (n, t, s, on) => { mk(); const c = document.getElementById('__card'); c.querySelector('.n').textContent = n || ''; c.querySelector('h1').textContent = t || ''; c.querySelector('p').textContent = s || ''; c.classList.toggle('on', !!on); };
  window.__cap = (t) => { mk(); const c = document.getElementById('__cap'); if (t) c.textContent = t; c.classList.toggle('on', !!t); };
  if (document.readyState !== 'loading') mk(); else document.addEventListener('DOMContentLoaded', mk);
};

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--hide-scrollbars', '--headless=new'] /* [2026-10-19] Alterado: Chrome atual encerra no headless legado com Playwright 1.64 */ });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, locale: 'pt-BR', acceptDownloads: true });
  await ctx.addInitScript(INIT);
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('PAGEERROR', e.message));

  // ---- screencast ----
  const cdp = await ctx.newCDPSession(p);
  const frames = []; let fi = 0;
  cdp.on('Page.screencastFrame', async f => {
    const name = String(fi++).padStart(6, '0') + '.jpg';
    fs.writeFileSync(path.join(framesDir, name), Buffer.from(f.data, 'base64'));
    frames.push({ name, t: f.metadata.timestamp });
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });

  // ---- helpers de "humano" ----
  let mx = 960, my = 540;
  const move = async (x, y, ms = 650) => {
    const dist = Math.hypot(x - mx, y - my); const steps = FAST ? 3 : Math.max(8, Math.min(60, Math.round(dist / 14)));
    await p.mouse.move(x, y, { steps }); mx = x; my = y; await sleep(ms * 0.3);
  };
  const center = async loc => { await loc.scrollIntoViewIfNeeded().catch(() => {}); await rawSleep(FAST ? 60 : 350); /* [2026-10-07] Alterado: espera o scroll suave assentar antes de medir o bbox (clique errava o textarea) */ const b = await loc.boundingBox(); if (!b) throw new Error('sem bbox: ' + loc); return [b.x + b.width / 2, b.y + b.height / 2]; };
  const hover = async loc => { const [x, y] = await center(loc); await move(x, y); };
  const click = async loc => { await hover(loc); await sleep(180); await p.mouse.down(); await sleep(70); await p.mouse.up(); await sleep(350); };
  const clickXY = async (x, y) => { await move(x, y); await sleep(150); await p.mouse.down(); await sleep(70); await p.mouse.up(); await sleep(350); };
  const type = async (loc, text, d = 38) => { await click(loc); await loc.focus(); await p.keyboard.type(text, { delay: FAST ? 0 : QUICK ? Math.round(d * 0.4) : d }); await sleep(300); };
  const scrollBy = async (dy, ms = 1400, x = 960, y = 600) => {
    await p.mouse.move(x, y); mx = x; my = y; const n = FAST ? 3 : Math.max(4, Math.round((QUICK ? ms * 0.5 : ms) / 20)); const step = dy / n;
    for (let i = 0; i < n; i++) { await p.mouse.wheel(0, step); await rawSleep(FAST ? 5 : 20); }
  };
  const scrollToY = async (target, ms = 1500) => { const cur = await p.evaluate(() => scrollY); await scrollBy(target - cur, ms); };
  const shot = async n => { if (SHOTS) await p.screenshot({ path: path.join(work, 'shots', n + '.png') }); };
  const caption = t => p.evaluate(t2 => window.__cap && window.__cap(t2), t).catch(() => {});
  const card = (n, t, s, on) => p.evaluate(([a, b, c, d]) => window.__card(a, b, c, d), [n, t, s, on]).catch(() => {});
  const goto = async url => { await p.goto(B + url, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(FAST ? 800 : 2500); };

  // ---- ações por beat (id -> async fn) ----
  const A = {};
  A.intro1 = async () => { await move(1100, 520, 900); await sleep(2000); };
  A.s1a = async () => { await move(700, 520); await sleep(1500); await move(520, 705); };
  A.s1b = async () => {
    await scrollToY(1420, 2200); await sleep(600);
    const r = p.locator('input[type=range]').first();
    if (await r.count()) { const b = await r.boundingBox(); await clickXY(b.x + b.width * 0.15, b.y + b.height / 2);
      await p.mouse.down(); await p.mouse.move(b.x + b.width * 0.6, b.y + b.height / 2, { steps: FAST ? 3 : 40 }); await p.mouse.up(); mx = b.x + b.width * 0.6; await sleep(900);
      await p.mouse.down(); await p.mouse.move(b.x + b.width * 0.35, b.y + b.height / 2, { steps: FAST ? 3 : 30 }); await p.mouse.up(); }
  };
  A.s1c = async () => { await scrollToY(2380, 2000); await move(420, 700, 800); await sleep(1500); await move(960, 700); await sleep(1500); await move(1500, 700); };
  A.s1d = async () => { await scrollToY(3450, 2200); await sleep(2500); await scrollToY(0, 1800); await sleep(500);
    await click(p.locator('a:has-text("Acessar Plataforma"), button:has-text("Acessar Plataforma")').first()); await p.waitForTimeout(FAST ? 600 : 1500); };
  A.s2a = async () => {
    await p.waitForSelector('input[type=email]'); await sleep(1000);
    await hover(p.locator('text=Credenciais de demonstração').first()); await sleep(1500);
    await type(p.locator('input[type=email]'), 'rafael.brito@ancoro.com', 45);
    await type(p.locator('input[type=password]'), 'demo123', 80);
    await click(p.locator('button:has-text("Entrar")').last());
    await p.waitForURL('**/dashboard', { timeout: 20000 }); await p.waitForTimeout(FAST ? 800 : 3000);
  };
  A.s3a = async () => { await sleep(1200); for (const [x, y] of [[1330, 247], [1510, 247], [1668, 247]]) { await move(x, y); await sleep(1200); } };
  A.s3b = async () => { await move(600, 760); await scrollBy(420, 1200); await sleep(500); await move(1100, 640); await sleep(1200); await move(1250, 700); await sleep(1200); await scrollBy(-420, 1200); };
  A.s3c = async () => { await type(p.locator('input[placeholder^="Buscar em todos"]'), 'faturamento', 90); await sleep(2500); };
  A.s3d = async () => {
    const s = p.locator('input[placeholder^="Buscar em todos"]'); await click(s); await p.keyboard.press('Control+A'); await p.keyboard.press('Delete'); await sleep(600);
    const sel = p.locator('select').filter({ has: p.locator('option', { hasText: 'Conflito' }) }).first();
    await hover(sel); await sleep(500); await sel.selectOption({ label: 'Conflito' }).catch(async () => { await sel.selectOption({ index: 4 }); }); await sleep(3000);
    await sel.selectOption({ index: 0 }); await sleep(1000);
  };
  const closeModal = async () => { await p.keyboard.press('Escape'); await sleep(500); if (await p.locator('text=Detalhes').first().isVisible().catch(() => false)) { await clickXY(120, 600); } await sleep(500); };
  A.s4a = async () => {
    await p.locator('tbody tr').first().hover(); await move(186, 695); await sleep(400); await p.mouse.down(); await p.mouse.up(); await sleep(1500);
    await p.waitForSelector('text=Identificação, text=IDENTIFICAÇÃO', { timeout: 5000 }).catch(() => {}); await move(960, 520); await sleep(2500); await scrollBy(300, 1200, 960, 600); await sleep(2500);
  };
  A.s4b = async () => { await click(p.locator('button:has-text("5W2H")').first()); await sleep(1500); await move(740, 560); await sleep(2500); await move(1180, 560); await sleep(2500); };
  A.s4c = async () => { await click(p.locator('button:has-text("TO-BE")').first()); await sleep(1500); await move(740, 560); await sleep(2500); await move(1180, 600); await sleep(2000); };
  A.s4d = async () => {
    await click(p.locator('button:has-text("Comentários")').first()); await sleep(800);
    await click(p.locator('button:has-text("Dúvida")').first());
    await type(p.locator('textarea[placeholder^="Adicionar novo"]'), 'Qual o critério de deduplicação para BPs com CPF repetido?', 32);
    await click(p.locator('button:has-text("Enviar Comentário")')); await sleep(2000);
  };
  A.s4e = async () => { await click(p.locator('button:has-text("Histórico")').first()); await sleep(1500); await move(960, 560); await sleep(2500); await shot('hist'); await closeModal(); };
  // [2026-10-07] Criado: clica no requisito na grade -> painel lateral com comentários (o novo do REQ-001 e os existentes do REQ-004)
  A.s4f = async () => {
    const rows = p.locator('tbody tr');
    await click(rows.nth(0).locator('td').nth(1)); await sleep(900);
    await click(p.locator('button:has-text("Comentários")').last()); await sleep(2200);
    await click(rows.nth(3).locator('td').nth(1)); await sleep(2800);
    await clickXY(1737, 382); await sleep(600);
  };
  A.s5a = async () => { await click(p.locator('button:has-text("Novo Requisito")')); await sleep(1500); await move(740, 190); await sleep(1500); await move(1170, 190); await sleep(800); };
  A.s5b = async () => {
    await type(p.locator('[name=shortDesc]'), 'Aplicar tarifa social no faturamento', 28);
    const cons = p.locator('select[name=responsibleConsultantId]'); await hover(cons); await cons.selectOption({ label: 'João Silva' }).catch(() => cons.selectOption({ index: 1 })); await sleep(500);
    await type(p.locator('[name=responsibleBusiness]'), 'Ana Costa', 28);
    await type(p.locator('[name=what]'), 'Aplicar a tarifa social de baixa renda no cálculo da fatura de energia.', 18);
    await type(p.locator('[name=why]'), 'Atender à regulação ANEEL e evitar cobrança indevida de clientes elegíveis.', 18);
    await type(p.locator('[name=who]'), 'Analista de faturamento', 22);
    await type(p.locator('[name=when]'), 'No início de cada ciclo mensal', 22);
    await type(p.locator('[name=where]'), 'Etapa de cálculo da fatura, hoje numa planilha do Faturamento', 22);
    await type(p.locator('[name=howMuch]'), '~12 mil clientes elegíveis', 22);
    await type(p.locator('[name=howToday]'), 'Desconto aplicado manualmente em planilha após o faturamento', 16);
  };
  A.s5c = async () => {
    await click(p.locator('button:has-text("Criar Requisito")')); await sleep(2500);
    await shot('created');
    await type(p.locator('input[placeholder^="Buscar em todos"]'), 'tarifa social', 70); await sleep(2800);
    const s = p.locator('input[placeholder^="Buscar em todos"]'); await click(s); await p.keyboard.press('Control+A'); await p.keyboard.press('Delete'); await sleep(800);
  };
  A.s6a = async () => { await sleep(1000); for (const x of [352, 656, 960, 1263]) { await move(x, 300); await sleep(900); } };
  A.s6b = async () => { await scrollBy(450, 1500); await sleep(1500); await move(800, 500); await sleep(1500); await scrollBy(450, 1500); await sleep(1500); await shot('matrix2'); await scrollBy(-900, 1500); };
  A.s6c = async () => { const i = p.locator('input[placeholder^="Buscar na matriz"]'); await type(i, 'BAPI', 120); await sleep(2200); await click(i); await p.keyboard.press('Control+A'); await p.keyboard.press('Delete'); await sleep(700);
    const sel = p.locator('select').first(); await hover(sel); await sel.selectOption({ index: 2 }); await sleep(2500); await sel.selectOption({ index: 0 }); await sleep(800); };
  A.s7a = async () => {
    // [2026-10-07] Alterado: zoom + clique em requisitos do grafo (destaca dependências e abre o painel do requisito)
    await sleep(1500); await move(1000, 520);
    for (let i = 0; i < 5; i++) { await p.mouse.wheel(0, -240); await sleep(350); } await sleep(1200); await shot('graph');
    await clickXY(1348, 528); await sleep(2800); await shot('node1');
    await clickXY(1514, 528); await sleep(2600); await shot('node2');
    await clickXY(1889, 204); await sleep(700);
  };
  A.s7b = async () => { for (let i = 0; i < 5; i++) { await p.mouse.wheel(0, 240); await sleep(250); }
    await click(p.locator('button:has-text("ISU-BILLING")').first()); await sleep(2500);
    await click(p.locator('button:has-text("Caminho Crítico")')); await sleep(3000); await shot('critical'); };
  A.s7c = async () => { await click(p.locator('button:has-text("Todos")').first()); await sleep(1500); await click(p.locator('button:has-text("Caminho Crítico")')); await sleep(1500); await move(700, 540); await sleep(1500); };
  // =====================================================================================================
  // [2026-10-19] Criado: beats do Process Studio (setores 08/09/10) — Rafael Brito
  // O editor BPMN vive num <iframe data-testid=process-editor>: localizadores via frameLocator; coordenadas do boundingBox
  // já vêm relativas ao viewport da página, então move/click (p.mouse) funcionam igual aos demais beats.
  const ed = () => p.frameLocator('iframe[data-testid="process-editor"]');
  const node = txt => ed().locator('svg.canvas .node', { hasText: txt }).first();
  const waitEditor = async () => { await ed().locator('svg.canvas .node').first().waitFor({ timeout: 20000 }); await sleep(800); };
  const saveEditor = async () => {
    await click(ed().locator('[data-action="host-save"]'));
    await ed().locator('[data-testid="dirty-badge"]').waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
    await sleep(1200);
  };

  A.p1a = async () => {
    await sleep(800);
    await click(p.locator('a:has-text("Processos"), button:has-text("Processos")').first());
    await p.waitForSelector('[data-testid=process-list] li', { timeout: 15000 }); await sleep(2200);
    await hover(p.locator('[data-testid=process-list] li').first()); await sleep(1800);
    await hover(p.locator('[data-testid=coverage]')); await sleep(2500);
    await hover(p.locator('[data-testid=publish-open]')); await sleep(1500);
  };
  A.p1b = async () => {
    await click(p.locator('[data-action=open-process]').first()); await waitEditor(); await shot('p1b-open');
    // percorre o fluxo: medição -> decisão -> faturamento -> contas a receber
    for (const t of ['Ciclo de leitura', 'Importar leituras', 'Leitura plausível', 'Gerar', 'Executar', 'Cálculo de tarifa', 'Notificar cliente', 'Acompanhar', 'Escalar']) {
      await hover(node(t)); await sleep(900);
    }
  };
  A.p1c = async () => {
    await hover(ed().locator('text=ELEMENTOS').first()); await sleep(1200); await move(430, 330, 800); await sleep(900); await move(430, 560, 800); await sleep(900);
    await click(node('Importar leituras')); await sleep(900);
    for (const tab of ['docs', 'people', 'execution']) { await click(ed().locator(`[data-tab="${tab}"]`)); await sleep(1100); }
    await shot('p1c-props');
    await hover(ed().locator('[data-action="undo"]')); await sleep(600); await hover(ed().locator('[data-action="redo"]')); await sleep(600);
    await hover(ed().locator('[data-action="export"]')); await sleep(900);
    await hover(p.locator('button:has-text("Importar")').first()); await sleep(1200);
  };
  A.p2a = async () => {
    await click(node('Cálculo de tarifa')); await sleep(900);
    await click(ed().locator('[data-tab="links"]')); await sleep(1500); await shot('p2a-links');
    await hover(ed().locator('.req-picker .tag').first()); await sleep(1800); await hover(ed().locator('.req-picker .tag').nth(1)); await sleep(1500);
  };
  A.p2b = async () => {
    const q = ed().locator('[data-testid="req-search"]');
    await type(q, 'tarifa social', 70); await ed().locator('[data-req]').first().waitFor({ timeout: 8000 }); await sleep(1200); await shot('p2b-search');
    await click(ed().locator('[data-req]').first()); await sleep(1500);
    await hover(ed().locator('.req-picker .tag').last()); await sleep(1200);
    await saveEditor(); await shot('p2b-saved');
    await hover(ed().locator('header .muted')); await sleep(1500);
  };
  A.p2c = async () => {
    await hover(p.locator('[data-testid=coverage-summary]')); await sleep(2500); await shot('p2c-coverage');
    await click(p.locator('[data-testid=coverage] button').first()); await sleep(1500);
    const li = p.locator('[data-testid=uncovered-list] li');
    await hover(li.nth(0)); await sleep(1200); await hover(li.nth(2)); await sleep(1200); await scrollBy(120, 900, 160, 800); await sleep(1500);
    await shot('p2c-list');
  };
  A.p2d = async () => {
    await click(p.locator('a:has-text("Requisitos")').first()); await p.waitForURL('**/dashboard', { timeout: 15000 }); await sleep(1500);
    const s = p.locator('input[placeholder^="Buscar em todos"]'); await type(s, 'tarifa social', 70); await sleep(1800);
    await click(p.locator('tbody tr').first().locator('td').nth(1)); await sleep(1400);
    await click(p.locator('button:has-text("🔀")').first()); await p.waitForSelector('[data-testid=requirement-processes]'); await sleep(2500); await shot('p2d-req-tab');
    await click(p.locator('[data-testid=requirement-processes] a').first()); await p.waitForURL('**/processes/**', { timeout: 15000 }); await waitEditor(); await sleep(1500);
  };
  A.p3a = async () => {
    await click(ed().locator('[data-action="host-versions"]')); await ed().locator('[data-testid="versions-dialog"]').waitFor(); await sleep(1500);
    await type(ed().locator('.modal input').first(), 'Marco: tarifa social vinculada', 40);
    await click(ed().locator('[data-action="version-snapshot"]')); await ed().locator('li[data-version="1"]').waitFor({ timeout: 8000 }); await sleep(1800); await shot('p3a-versions');
    await hover(ed().locator('li[data-version="1"]')); await sleep(2000);
    await click(ed().locator('.modal-actions button').first()); await sleep(900);
  };
  A.p3b = async () => {
    await click(p.locator('[data-testid=publish-open]')); await p.waitForSelector('[data-testid=publish-dialog]'); await sleep(1500);
    await type(p.locator('[data-testid=publish-label]'), 'Release 2026.10', 50);
    await type(p.locator('[data-testid=publish-password]'), 'demo2026', 70); await sleep(1500); await shot('p3b-dialog');
    const dl = p.waitForEvent('download', { timeout: 30000 });
    await click(p.locator('[data-testid=publish-confirm]'));
    const d = await dl; await d.saveAs(path.join(work, 'portal.zip')); await sleep(2500); await shot('p3b-done');
  };
  A.p3c = async () => {
    // extrai o ZIP gerado e serve em http local (o portal usa módulos: file:// não serve)
    const dir = path.join(work, 'portal'); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    // [2026-10-19] Alterado: Expand-Archive em vez de tar (o tar do Git Bash lê "C:" como host remoto)
    require('child_process').execFileSync('powershell', ['-NoProfile', '-Command', `Expand-Archive -Force -LiteralPath '${path.join(work, 'portal.zip')}' -DestinationPath '${dir}'`]);
    const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
    const srv = require('http').createServer((q, r) => {
      let f = path.join(dir, decodeURIComponent(q.url.split('?')[0])); if (!path.extname(f)) f = path.join(dir, 'index.html');
      fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream' }); r.end(d); });
    }).listen(5301);
    try {
      await card('', 'Portal publicado', 'Site estático, pronto para hospedar', true); await rawSleep(1500);
      await p.goto('http://localhost:5301/', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1500); await card('', '', '', false); await rawSleep(500);
      mx = 960; my = 540;
      const pw = p.locator('input[type=password]');
      if (await pw.count()) { await shot('p3c-gate'); await sleep(1500); await type(pw, 'demo2026', 80); await p.keyboard.press('Enter'); await p.waitForTimeout(2500); }
      await shot('p3c-portal'); await sleep(1500);
      await click(p.locator('svg .node', { hasText: 'Cálculo de tarifa' }).first()); await sleep(2500); await shot('p3c-element');
      await click(p.locator('[role=tab]:has-text("Elementos"), button:has-text("Elementos")').first()); await sleep(2500); await shot('p3c-elements');
      const search = p.locator('input[placeholder^="Buscar"]').first(); await type(search, 'tarifa', 90); await sleep(2500); await shot('p3c-search');
    } finally { srv.close(); }
  };

  A.s8a = async () => { await sleep(1800); for (const [x, y] of [[498, 210], [806, 210], [1114, 210], [1422, 210], [498, 350], [806, 350], [1114, 350], [1422, 350]]) { await move(x, y); await sleep(900); } };
  // [2026-10-07] Alterado: métricas completas — percorre a página inteira (status, módulos, consultores, gráficos) passando o mouse p/ tooltips
  A.s8b = async () => {
    const H = await p.evaluate(() => document.documentElement.scrollHeight - innerHeight); let k = 0;
    for (let y = 0; y < H; y += 420) { await scrollBy(420, 1200); await sleep(1400); for (const x of [620, 900, 1250]) { await move(x, 520 + (k % 2) * 160, 500); await sleep(500); } k++; }
    await sleep(800);
  };
  A.s9a = async () => { await click(p.locator('button:has-text("Exportar BPD")')); await sleep(1800); await hover(p.locator('text=Atenção antes de exportar')); await sleep(2200);
    const pv = p.locator('text=Mostrar preview'); if (await pv.count()) { await click(pv.first()); await sleep(2500); await shot('preview'); }
    await click(p.locator('button:has-text("Cancelar")').first()); await sleep(800); };
  A.s9b = async () => { await click(p.locator('button:has-text("Gerenciar Membros")')); await sleep(2500); await shot('members'); await move(960, 520); await sleep(2500);
    await p.keyboard.press('Escape'); await sleep(600); if (await p.locator('text=/Membros do Projeto|Gerenciar Membros/').count() > 1) { const c = p.locator('button:has-text("Fechar"), button:has-text("Cancelar")').first(); if (await c.count()) await click(c); } await sleep(500); };
  const switcher = () => p.locator('header button').filter({ hasText: 'Distribuidora|Telecom|Varejo' }).first();
  const openSwitcher = async () => { await click(p.locator('header button').filter({ hasText: 'Projeto Demo' }).first()); await sleep(900); };
  A.s10a = async () => {
    await openSwitcher(); await click(p.locator('text=BRIM').first()); await sleep(3000); await shot('brim');
    await openSwitcher(); await click(p.locator('text=Salesforce').first()); await sleep(3000); await shot('sf');
  };
  A.s10b = async () => {
    await click(p.locator('header button:has-text("PT")')); await sleep(800); await shot('lang');
    await click(p.locator('text="English"').last()); await sleep(3200);
    await click(p.locator('header button:has-text("EN")')); await sleep(800); await click(p.locator('text="Português"').last()); await sleep(1500);
  };
  A.outro1 = async () => { await sleep(1500); };

  // ---- navegação "atrás do cartão" entre setores ----
  const PRE = {
    s1: async () => { await goto('/'); },
    s3: async () => { /* já no dashboard após login */ },
    s6: async () => { await goto('/dashboard'); await clickMatrixNav(); },
    s7: async () => { await goto('/dependency-graph'); },
    p1: async () => { await goto('/dashboard'); },   // [2026-10-19] p1 entra clicando em "Processos" no menu (beat p1a)
    s8: async () => { await goto('/metrics'); },
    s9: async () => { await goto('/dashboard'); },
    s10: async () => { await goto('/dashboard'); },
  };
  const clickMatrixNav = async () => { await goto('/cross-matrix'); };

  // ---- execução ----
  const timeline = { t0: null, beats: [], sectors: [] };
  await p.goto(B + (QUICK ? '/login' : '/'), { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1500);
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  await rawSleep(500);
  const nowS = () => Date.now() / 1000;
  const only = (process.argv.find(a => a.startsWith('--only=')) || '').split('=')[1];

  for (const sec of sectors) {
    if (only && !only.split(',').includes(sec.id)) continue;
    if (QUICK && ['intro', 'outro', 's1'].includes(sec.id)) continue;
    const isBookend = sec.id === 'intro' || sec.id === 'outro';
    // cartão de setor (intro: sem narração antes; demais: cartão ~3s, depois cai a ação)
    if (QUICK) {
      timeline.sectors.push({ id: sec.id, title: sec.title, n: sec.n, start: nowS() });
      if (sec.id !== 's2' && sec.id !== 's3') { await card('SETOR ' + sec.n, sec.title, '', true); await rawSleep(1100); if (PRE[sec.id]) await PRE[sec.id](); await card('', '', '', false); await rawSleep(500); }
      else if (sec.id === 's3') { await card('SETOR ' + sec.n, sec.title, '', true); await rawSleep(1000); await card('', '', '', false); await rawSleep(500); }
      for (const b of sec.beats) { await (A[b.id] ? A[b.id]() : Promise.resolve()).catch(e => console.log('ERRO beat ' + b.id + ': ' + e.message.split('\n')[0])); }
      continue;
    }
    await card(sec.n ? 'SETOR ' + sec.n : 'ANCORA REQOPS METHOD', sec.title, sec.sub, true);
    timeline.sectors.push({ id: sec.id, title: sec.title, n: sec.n, start: nowS() });
    await caption('');
    await sleep(sec.id === 'intro' ? 3200 : 2800);
    if (PRE[sec.id]) await PRE[sec.id]();
    if (sec.id === 'intro') { /* mantém cartão durante a narração de abertura */ }
    else if (sec.id !== 'outro') await card('', '', '', false);
    if (sec.id === 'intro') { const i0 = sec.beats[0]; timeline.beats.push({ id: i0.id, start: nowS() }); await caption(i0.say); await sleep(dur[i0.id] * 1000 + 600); await caption(''); await card('', '', '', false); await sleep(700); continue; }
    if (sec.id === 'outro') { await card('', sec.title, sec.sub, true); const b0 = sec.beats[0]; timeline.beats.push({ id: b0.id, start: nowS() }); await caption(b0.say); await sleep(dur[b0.id] * 1000 + 2500); await caption(''); await sleep(1200); continue; }
    await sleep(600);
    for (const b of sec.beats) {
      const start = nowS(); timeline.beats.push({ id: b.id, start });
      await caption(b.say);
      const act = (A[b.id] ? A[b.id]() : Promise.resolve()).catch(e => { console.log('ERRO beat ' + b.id + ': ' + e.message.split('\n')[0]); });
      await Promise.all([act, rawSleep(FAST ? 200 : dur[b.id] * 1000 + 500)]);
      await shot(b.id);
    }
    await caption('');
  }
  await rawSleep(800);
  await cdp.send('Page.stopScreencast');
  timeline.end = nowS();
  timeline.t0 = frames[0].t; timeline.frames = frames;
  fs.writeFileSync(path.join(work, 'timeline.json'), JSON.stringify(timeline));
  console.log('frames:', frames.length, ' duração:', (timeline.end - timeline.t0).toFixed(1) + 's', ' t0 offset vs Date.now:', (frames[0].t - (Date.now() / 1000)).toFixed(2));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
