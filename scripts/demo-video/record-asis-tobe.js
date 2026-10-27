// [2026-10-27] Criado: grava o vídeo de 45 s "AS-IS / TO-BE + processo" (agora 55 s, ritmo mais calmo p/ prospect) com o MESMO exemplo do trailer (REQ-003, Criar contrato de fornecimento) — Rafael Brito
// Roteiro (pedido do Rafael): AS-IS e TO-BE dentro da visualização do requisito (modal, aba 5W2H) e na lateral da tela (painel),
// o "Comparar" (comparativo AS-IS x TO-BE em tela cheia) e o processo DESENHADO na ferramenta de processos (Process Studio) já
// vinculado ao REQ-003.
// Decisões:
//  - Mesmo mecanismo do record-trailer.js (screencast CDP + cursor/ripple injetados no DOM, legenda numa faixa de 80 px abaixo do app).
//  - Uma única sessão (rafael.brito@ancoro.com, MANAGER): aqui não há troca de pessoa, ao contrário do trailer.
//  - O editor de processos roda num <iframe> (mesma origem): o cursor falso precisa ser atualizado também a partir de DENTRO do iframe,
//    senão ele some quando o mouse passa sobre o diagrama. Ver INIT (ramo window !== window.top).
//  - O processo é desenhado de verdade (paleta -> clique no diagrama -> nome inline -> alça de conexão), sem atalho por API.
//  - Dados 100% do seed demo (banco descartável). O roteiro CRIA um processo novo: para regravar, rode `process-studio-env.sh reset`.
// Uso:
//   scripts/e2e/process-studio-env.sh up        # backend :3100 + frontend :5199 (SQLite descartável)
//   NODE_PATH=<dir c/ playwright> node scripts/demo-video/record-asis-tobe.js [workDir]
//   DEBUG_SHOTS=<dir> grava um PNG ao fim de cada cena (para conferir o roteiro sem montar o vídeo)
//   NO_RENDER=1 só executa o roteiro (sem montar o MP4)
// [2026-10-27] Alterado: orçamentos rebalanceados após ensaio (compare sobrava ~1,5 s; draw estourava 0,1 s). Eventos (início/fim) são nomeados
//   por duplo clique — só tarefas/gateways entram em edição inline ao inserir (store.ts insertNode).
// [2026-10-27] Alterado: nova cena 'versions' (versionamento do processo) pedida pelo Rafael: Salvar (v1) -> criar o evento de fim PELO "+" do
//   elemento (criação a partir de objeto já no canvas) -> Salvar (v2) -> Versões: rótulo + histórico v2/v1. Para abrir tempo: o fim deixou de ser
//   desenhado na cena 'draw' (nasce na cena 'versions'), o Salvar saiu da cena 'link' e os orçamentos foram redistribuídos (soma segue 45 s).
//   Requer o build atual do editor (npm run build:process-studio) — o "+" (data-handle="quick") é novo.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..', '..');
const work = path.resolve(process.argv[2] || path.join(root, 'demo-video', '.asis-tobe-rec'));
const B = process.env.ANCORO_URL || 'http://localhost:5199';
const MUSIC = path.join(root, 'AncoroSong_sem_fala.mp3');
// [2026-10-27] OUT_FILE: saída alternativa (ex.: regravar só um trecho e emendar no vídeo aprovado)
const OUT = process.env.OUT_FILE || path.join(root, 'demo-video', 'Ancoro_AsIs_ToBe_55s.mp4');
const SHOTS = process.env.DEBUG_SHOTS ? path.resolve(process.env.DEBUG_SHOTS) : null;
fs.mkdirSync(work, { recursive: true }); if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const framesDir = path.join(work, 'frames'); fs.rmSync(framesDir, { recursive: true, force: true }); fs.mkdirSync(framesDir, { recursive: true });
const rawSleep = ms => new Promise(r => setTimeout(r, ms));
const sleep = rawSleep;

const VIEW_H = 1000, BAND_H = 80; // app em 1920x1000 + faixa de legenda de 80 px = 1080
// orçamento (s) e legenda (faixa inferior) por cena — soma 55
const SCENES = [
  { id: 'hook', budget: 3.6, cap: 'Antes de construir, é preciso comparar.' },
  { id: 'view', budget: 8.2, cap: 'No requisito: como é hoje (AS-IS) e como será (TO-BE)' },
  { id: 'compare', budget: 8.2, cap: 'Na lateral: alterne AS-IS e TO-BE e compare campo a campo' },
  { id: 'draw', budget: 11.6, cap: 'Desenhe pela paleta ou pelo + a partir de qualquer elemento' },
  { id: 'link', budget: 4.6, cap: 'Vinculado ao requisito: o que foi pedido e o que foi desenhado' },
  { id: 'versions', budget: 14.8, cap: 'Salvar grava o processo (r); a versão é um marco com o r registrado' },
  { id: 'outro', budget: 4.0, cap: 'Ancora ReqOps Method' },
];
const BUDGET = Object.fromEntries(SCENES.map(s => [s.id, s.budget]));
const TOTAL = SCENES.reduce((a, s) => a + s.budget, 0);
if (Math.abs(TOTAL - 55) > 0.01) throw new Error('orçamento deve somar 55 s, soma ' + TOTAL);

const INIT = () => {
  // Dentro do iframe do editor: só repassa o mouse ao cursor falso do documento pai (mesma origem).
  if (window !== window.top) {
    try {
      const fe = window.frameElement; if (!fe) return;
      const par = window.parent.document;
      addEventListener('mousemove', e => {
        const r = fe.getBoundingClientRect(), cur = par.getElementById('__cur');
        if (cur) cur.style.transform = `translate(${r.left + e.clientX - 4}px,${r.top + e.clientY - 2}px)`;
      }, true);
      addEventListener('mousedown', e => {
        const r = fe.getBoundingClientRect(), rip = par.createElement('div');
        rip.className = '__rip'; rip.style.left = (r.left + e.clientX) + 'px'; rip.style.top = (r.top + e.clientY) + 'px';
        par.documentElement.appendChild(rip); setTimeout(() => rip.remove(), 700);
      }, true);
    } catch (e) { /* iframe de outra origem: sem cursor dentro dele */ }
    return;
  }
  const mk = () => {
    if (document.getElementById('__ov')) return;
    const st = document.createElement('style');
    st.textContent = `
#__cur{position:fixed;left:0;top:0;width:30px;height:30px;z-index:2147483647;pointer-events:none;transform:translate(-100px,-100px);filter:drop-shadow(0 2px 3px rgba(0,0,0,.45))}
.__rip{position:fixed;z-index:2147483646;pointer-events:none;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;border:3px solid #14b8a6;animation:__rip .55s ease-out forwards}
@keyframes __rip{to{transform:scale(4.2);opacity:0}}
.__scr{position:fixed;inset:0;z-index:2147483645;display:flex;flex-direction:column;align-items:center;justify-content:center;
 background:#eef3f6;color:#0b1a30;opacity:0;pointer-events:none;transition:opacity .35s ease;font-family:'Plus Jakarta Sans',Inter,system-ui,sans-serif}
.__scr.on{opacity:1;pointer-events:all}
#__chat{width:960px;display:flex;flex-direction:column;gap:22px}
.__row{display:flex;align-items:flex-end;gap:14px;opacity:0;transform:translateY(14px);transition:opacity .25s,transform .25s}
.__row.in{opacity:1;transform:none}
.__row.r{flex-direction:row-reverse}
.__av{flex:none;width:48px;height:48px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:17px;color:#fff}
.__row.r .__col{display:flex;flex-direction:column;align-items:flex-end}
.__who{font-size:15px;color:#6b7c8f;margin:0 6px 6px;font-weight:600}
.__b{max-width:720px;padding:18px 24px;border-radius:22px;font-size:34px;line-height:1.3;font-weight:500;box-shadow:0 2px 8px rgba(11,26,48,.08)}
.__row.l .__b{background:#fff;border-bottom-left-radius:6px}
.__row.r .__b{background:#0f766e;color:#fff;border-bottom-right-radius:6px}
#__outro img{height:230px;width:auto;margin-bottom:18px}
#__outro h1{font-size:104px;margin:0;font-weight:800;letter-spacing:-.02em}
#__outro .l1{font-size:54px;margin:18px 0 0;font-weight:700;color:#0f766e;text-align:center;letter-spacing:-.01em}`;
    document.head.appendChild(st);
    const w = document.createElement('div'); w.id = '__ov';
    w.innerHTML = `<svg id="__cur" viewBox="0 0 24 24"><path d="M3 2l7.5 19 2.7-7.6L21 10.7z" fill="#fff" stroke="#0b1a30" stroke-width="1.6" stroke-linejoin="round"/></svg>
<div id="__hook" class="__scr"><div id="__chat"></div></div>
<div id="__outro" class="__scr"><img src="/logo-new.png" alt=""><h1>Ancoro</h1>
 <div class="l1">Do AS-IS ao TO-BE. Do requisito ao processo.</div>
</div>`;
    document.documentElement.appendChild(w);
    const cur = document.getElementById('__cur');
    addEventListener('mousemove', e => { cur.style.transform = `translate(${e.clientX - 4}px,${e.clientY - 2}px)`; }, true);
    addEventListener('mousedown', e => { const r = document.createElement('div'); r.className = '__rip'; r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px'; document.documentElement.appendChild(r); setTimeout(() => r.remove(), 700); }, true);
  };
  window.__show = (id, on) => { mk(); document.getElementById(id).classList.toggle('on', !!on); document.getElementById('__cur').style.display = on ? 'none' : ''; };
  window.__playHook = lines => {
    mk(); const chat = document.getElementById('__chat'); chat.innerHTML = '';
    lines.forEach(L => setTimeout(() => {
      const row = document.createElement('div'); row.className = '__row ' + L.side;
      row.innerHTML = `<div class="__av" style="background:${L.color}">${L.av}</div><div class="__col"><div class="__who">${L.who}</div><div class="__b"></div></div>`;
      chat.appendChild(row); requestAnimationFrame(() => row.classList.add('in'));
      const b = row.querySelector('.__b'); let i = 0;
      const tick = () => { if (i <= L.text.length) { b.textContent = L.text.slice(0, i++); setTimeout(tick, 22); } };
      tick();
    }, L.at));
  };
  if (document.readyState !== 'loading') mk(); else document.addEventListener('DOMContentLoaded', mk);
};

const HOOK_LINES = [
  { side: 'l', who: 'Gerente de projeto', av: 'GP', color: '#475569', text: 'O que muda no contrato de fornecimento?', at: 120 },
  { side: 'r', who: 'Consultor', av: 'C', color: '#14b8a6', text: 'Deixa eu mostrar: hoje, amanhã e o processo.', at: 1500 },
];

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--hide-scrollbars', '--headless=new'] });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: VIEW_H }, deviceScaleFactor: 1, locale: 'pt-BR' });
  await ctx.addInitScript(INIT);
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('PAGEERROR', e.message));
  const cdp = await ctx.newCDPSession(p);
  const frames = []; let fi = 0;
  cdp.on('Page.screencastFrame', async f => {
    const name = String(fi++).padStart(6, '0') + '.jpg';
    fs.writeFileSync(path.join(framesDir, name), Buffer.from(f.data, 'base64'));
    frames.push({ name, t: f.metadata.timestamp });
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });

  // ---- helpers (coordenadas sempre do viewport do frame principal; boundingBox de elemento em iframe já vem nesse referencial) ----
  let mx = 960, my = 500;
  const move = async (x, y, ms = 400) => {
    const steps = Math.max(5, Math.min(24, Math.round(Math.hypot(x - mx, y - my) / 28)));
    await p.mouse.move(x, y, { steps }); mx = x; my = y; await sleep(ms * 0.15);
  };
  const center = async loc => { await loc.scrollIntoViewIfNeeded().catch(() => {}); await rawSleep(120); const b = await loc.boundingBox(); if (!b) throw new Error('sem bbox'); return [b.x + b.width / 2, b.y + b.height / 2]; };
  const click = async (loc, ms = 350) => { const [x, y] = await center(loc); await move(x, y, ms); await sleep(60); await p.mouse.down(); await sleep(40); await p.mouse.up(); await sleep(140); };
  const clickXY = async (x, y, ms = 350) => { await move(x, y, ms); await sleep(60); await p.mouse.down(); await sleep(40); await p.mouse.up(); await sleep(140); };
  const hideBanner = () => p.evaluate(() => { for (const d of document.querySelectorAll('div.fixed')) if (/MODO DEMO/.test(d.textContent || '') && d.textContent.length < 120) d.style.display = 'none'; });
  const show = (id, on) => p.evaluate(a => window.__show(...a), [id, on]).catch(() => {});
  const timeline = {}, sceneStart = {}, sceneReady = {};
  const scene = async (id, act) => {
    const t0 = Date.now(); sceneStart[id] = t0 / 1000;
    await Promise.resolve(act(() => { sceneReady[id] = Date.now() / 1000; })).catch(e => console.log('ERRO cena ' + id + ': ' + String(e.message).split('\n')[0]));
    const used = (Date.now() - t0) / 1000;
    console.log(`cena ${id}: ação ${used.toFixed(1)} s / orçamento ${BUDGET[id]} s${used > BUDGET[id] ? '  <-- ESTOUROU' : ''}`);
    if (SHOTS) await p.screenshot({ path: path.join(SHOTS, `cena-${id}.png`) }).catch(() => {});
    const rest = BUDGET[id] * 1000 - (Date.now() - t0); if (rest > 0) await rawSleep(rest);
    timeline[id] = (Date.now() - t0) / 1000;
  };

  // ---- login (fora da gravação) ----
  await p.goto(B + '/login', { waitUntil: 'domcontentloaded' }); await p.waitForSelector('input[type=email]');
  await p.fill('input[type=email]', 'rafael.brito@ancoro.com'); await p.fill('input[type=password]', 'demo123');
  await p.click('button:has-text("Entrar")'); await p.waitForURL('**/dashboard'); await p.waitForSelector('tbody tr'); await p.waitForTimeout(2500);
  await hideBanner();
  const req003 = () => p.locator('tbody tr').nth(2);   // REQ-003 — Criar contrato de fornecimento (mesma posição usada no trailer)
  // a 1ª coluna é a engrenagem (sem texto); o REQ ID está na 2ª
  const row0 = await req003().locator('td').nth(1).innerText();
  if (!/003/.test(row0)) throw new Error('3ª linha não é o REQ-003: ' + row0);

  await show('__hook', true); await rawSleep(500);
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: VIEW_H, everyNthFrame: 1 });
  const tStart = Date.now();

  // 1) abertura
  await scene('hook', async mark => { mark(); await p.evaluate(l => window.__playHook(l), HOOK_LINES); });
  await show('__hook', false);

  // 2) dentro da visualização do requisito: modal -> aba 5W2H -> AS-IS e TO-BE
  await scene('view', async mark => {
    await move(900, 700, 250);
    await click(req003().locator('td').first(), 300);                       // abre o modal de detalhes do REQ-003
    await p.waitForSelector('text=Detalhes', { timeout: 8000 }); await sleep(350); mark();
    await click(p.locator('button:has-text("5W2H")').first(), 300); await sleep(250);
    await move(1100, 520, 250); await sleep(1600);                          // lê o AS-IS (estado atual)
    await click(p.getByRole('button', { name: 'TO-BE', exact: true }).first(), 300); await sleep(250);
    await move(1100, 560, 250); await sleep(1900);                          // lê o TO-BE (visão futura)
    await click(p.locator('button[aria-label="Fechar modal"]'), 250); await sleep(300);
  });

  // 3) na lateral: seleciona o requisito -> alterna AS-IS/TO-BE no painel -> Comparar (tela cheia)
  await scene('compare', async mark => {
    await click(req003().locator('td').nth(1), 300);                         // clica no REQ ID: seleciona a linha e abre o painel lateral (a descrição é célula editável)
    await p.waitForSelector('button:has-text("Comparar")', { timeout: 8000 }); await sleep(300); mark();
    await sleep(900);                                                        // painel em AS-IS (padrão)
    await click(p.getByRole('button', { name: 'TO-BE', exact: true }).first(), 300); await sleep(900);
    await click(p.locator('button:has-text("Comparar")').first(), 300); await sleep(500);
    await move(960, 640, 250);
    for (let i = 0; i < 3; i++) { await p.mouse.wheel(0, 260); await sleep(650); }  // rola o comparativo campo a campo
    await sleep(300);
    await click(p.locator('button[aria-label="Fechar"]').first(), 250); await sleep(250);
  });

  // 4) processo desenhado na ferramenta (Process Studio, iframe)
  let fr;
  const nodeBox = async id => { const b = await fr.locator(`[data-id="${id}"]`).first().boundingBox(); if (!b) throw new Error('sem nó ' + id); return b; };
  const connect = async (srcId, dstId) => {
    await click(fr.locator(`[data-id="${srcId}"]`).first(), 200);
    const h = await fr.locator('[data-handle="connect"]').first().boundingBox();
    const d = await nodeBox(dstId);
    await move(h.x + h.width / 2, h.y + h.height / 2, 200); await p.mouse.down();
    await p.mouse.move(d.x + d.width / 2, d.y + d.height / 2, { steps: 14 }); await p.mouse.up(); mx = d.x + d.width / 2; my = d.y + d.height / 2; await sleep(150);
  };
  // insere um elemento da paleta à direita do último e dá nome (edição inline). Devolve o id do nó criado.
  const addNode = async (tool, label, atX, atY, wait = 120) => {
    const before = await fr.locator('svg.canvas .node').evaluateAll(ns => ns.map(n => n.getAttribute('data-id')));
    await click(fr.locator(`[data-tool="${tool}"]`).first(), 220);
    await clickXY(atX, atY, 250); await sleep(wait);
    const after = await fr.locator('svg.canvas .node').evaluateAll(ns => ns.map(n => n.getAttribute('data-id')));
    const made = after.find(i => !before.includes(i));
    if (!made) throw new Error('nó não criado: ' + tool);
    if (label) {
      // Tarefas/gateways entram em edição inline ao inserir; EVENTOS não (store.ts insertNode) — para nomeá-los: duplo clique no elemento.
      if (/^(start|end|inter|boundary)/.test(tool)) { const b = await nodeBox(made); await p.mouse.dblclick(b.x + b.width / 2, b.y + b.height / 2); await sleep(200); }
      await p.keyboard.type(label, { delay: 14 }); await p.keyboard.press('Enter'); await sleep(120);
    }
    return made;
  };
  // cria pelo "+" do elemento selecionado: o novo nó já vem conectado; tarefas/gateways abrem a edição inline do nome
  const quickAdd = async (srcId, tool, label) => {
    const before = await fr.locator('svg.canvas .node').evaluateAll(ns => ns.map(n => n.getAttribute('data-id')));
    await click(fr.locator(`[data-id="${srcId}"]`).first(), 220);
    await click(fr.locator('[data-handle="quick"]').first(), 220);
    await click(fr.locator(`[data-quick="${tool}"]`).first(), 220); await sleep(150);
    const after = await fr.locator('svg.canvas .node').evaluateAll(ns => ns.map(n => n.getAttribute('data-id')));
    const made = after.find(i => !before.includes(i));
    if (!made) throw new Error('nó não criado pelo "+": ' + tool);
    if (label) { await p.keyboard.type(label, { delay: 14 }); await p.keyboard.press('Enter'); await sleep(120); }
    return made;
  };
  let contractTaskId = null;
  await scene('draw', async mark => {
    await click(p.locator('button:has-text("Processos"), a:has-text("Processos")').first(), 300);
    await p.waitForURL('**/processes', { timeout: 10000 }); await p.waitForSelector('input[placeholder^="Nome do novo"]'); await hideBanner(); mark();
    await click(p.locator('input[placeholder^="Nome do novo"]'), 250);
    await p.keyboard.type('Criar contrato de fornecimento (TO-BE)', { delay: 10 });
    await click(p.locator('button:has-text("Criar")').first(), 250);
    await p.waitForSelector('iframe[data-testid="process-editor"]', { timeout: 15000 });
    fr = await (await p.$('iframe[data-testid="process-editor"]')).contentFrame();
    await fr.waitForSelector('[data-id]', { timeout: 20000 }); await sleep(500);
    const s0 = (await fr.locator('svg.canvas .node').evaluateAll(ns => ns.map(n => n.getAttribute('data-id'))))[0];
    // O editor enquadra o processo ao abrir: com só o evento de início ele fica no centro e em zoom 1,5. Para caber o fluxo inteiro
    // (5 elementos) afastamos o zoom (roda do mouse ancorada no cursor) e arrastamos o início para a esquerda — gestos reais do editor.
    let sb = await nodeBox(s0); const startModelW = 36; // Start_1 nasce com bounds.w = 36 (process-core newProcess)
    await move(sb.x + sb.width / 2, sb.y + sb.height / 2, 200);
    await p.mouse.wheel(0, 270); await sleep(300);                        // k: 1,5 -> ~1,0
    sb = await nodeBox(s0);
    const y = 560, k = sb.width / startModelW;
    await move(sb.x + sb.width / 2, sb.y + sb.height / 2, 150); await p.mouse.down();
    await p.mouse.move(640, y, { steps: 18 }); await p.mouse.up(); mx = 640; my = y; await sleep(200);
    sb = await nodeBox(s0);
    const step = 165 * k, x0 = sb.x + sb.width / 2;                         // 165 unidades do modelo entre centros (tarefa ~110 de largura)
    const t1 = await addNode('task-service', 'Consultar crédito', x0 + step, y);
    await connect(s0, t1);
    // [2026-10-27] Alterado: o gateway nasce pelo "+" do elemento existente (já conectado), mostrando as DUAS formas de desenhar
    //   (paleta à esquerda e "+" a partir do que já está no canvas) — pedido do Rafael
    const g1 = await quickAdd(t1, 'gw-exclusive', 'Crédito aprovado?');
    contractTaskId = await addNode('task-service', 'Criar contrato', x0 + step * 3, y);
    await connect(g1, contractTaskId);
    // [2026-10-27] Removido: evento de fim "Contrato ativo" daqui — nasce na cena 'versions' pelo "+" do elemento (abre tempo p/ o versionamento)
  });

  // 5) vincula o REQ-003 à tarefa "Criar contrato" e salva
  await scene('link', async mark => {
    if (!contractTaskId) throw new Error('a tarefa "Criar contrato" não foi desenhada (cena draw falhou)');
    mark(); await click(fr.locator(`[data-id="${contractTaskId}"]`).first(), 300);
    await click(fr.locator('[data-tab="links"]').first(), 250);
    await click(fr.locator('[data-testid="req-search"]').first(), 250);
    await p.keyboard.type('REQ-003', { delay: 40 });
    await fr.waitForSelector('[data-req="REQ-003"]', { timeout: 8000 });
    await click(fr.locator('[data-req="REQ-003"]').first(), 300); await sleep(1600);
    // [2026-10-27] Removido: Salvar daqui — o salvamento (v1) agora abre a cena 'versions'
  });

  // 5b) versionamento: Salvar grava o processo (r); a VERSÃO é um marco criado em Versões > Salvar versão e registra o r em que foi tirada
  // [2026-10-27] Alterado: salvar deixou de criar versão (backend) — a cena agora cria v1 e v2 pelo diálogo — Rafael Brito
  const saveVersion = async (label) => {
    await click(fr.locator('[data-action="host-versions"]').first(), 250); await sleep(350);
    await click(fr.locator('[data-testid="versions-dialog"] input').first(), 200);
    await p.keyboard.type(label, { delay: 22 });
    await click(fr.locator('[data-action="version-snapshot"]').first(), 250);
    await fr.waitForSelector(`[data-testid="versions-dialog"] li[data-version="${label.startsWith('Aprovado') ? 2 : 1}"]`, { timeout: 8000 });
  };
  await scene('versions', async mark => {
    mark();
    await click(fr.locator('[data-action="host-save"]').first(), 250); await sleep(800);                 // processo salvo (r sobe)
    await saveVersion('Primeira proposta'); await sleep(1500);                                              // v1 registra o r
    await click(fr.locator('[data-testid="versions-dialog"] .modal-actions button').first(), 200); await sleep(200);
    await click(fr.locator(`[data-id="${contractTaskId}"]`).first(), 250);
    await click(fr.locator('[data-handle="quick"]').first(), 250);                                          // "+" do elemento selecionado
    await click(fr.locator('[data-quick="end"]').first(), 250); await sleep(300);                           // cria o fim já conectado
    await click(fr.locator('[data-action="host-save"]').first(), 250); await sleep(800);                 // novo r
    await saveVersion('Aprovado pelo cliente');                                                              // v2 com o novo r
    await move(mx + 40, my + 40, 200); await sleep(2600);                                                   // lê o histórico (v2 e v1, cada uma com seu r)
  });

  // 6) fecho
  await scene('outro', async mark => { await show('__outro', true); mark(); await sleep(400); });

  await rawSleep(300);
  await cdp.send('Page.stopScreencast');
  const tEnd = Date.now();
  fs.writeFileSync(path.join(work, 'timeline.json'), JSON.stringify({ timeline, frames: frames.length, seconds: (tEnd - tStart) / 1000 }));
  console.log('frames', frames.length, 'cenas', JSON.stringify(timeline), 'duração real', ((tEnd - tStart) / 1000).toFixed(1) + 's');
  await browser.close();
  if (process.env.NO_RENDER) { console.log('NO_RENDER: roteiro executado, MP4 não montado'); return; }

  // ---- montagem: frames (durations irregulares) -> 30 fps CFR + faixa de legenda + trilha, corte exato em 55 s (igual ao trailer) ----
  const lines = [];
  frames.forEach((f, i) => { const next = i + 1 < frames.length ? frames[i + 1].t : f.t + 0.04; lines.push(`file '${path.join(framesDir, f.name).replace(/\\/g, '/')}'`, `duration ${Math.max(0.001, next - f.t).toFixed(4)}`); });
  lines.push(`file '${path.join(framesDir, frames[frames.length - 1].name).replace(/\\/g, '/')}'`);
  const list = path.join(work, 'frames.txt'); fs.writeFileSync(list, lines.join('\n'));
  const off = frames[0].t - tStart / 1000; console.log('offset 1º quadro vs início das cenas:', off.toFixed(2) + 's');
  const useReal = Math.abs(off) < 2;
  let acc = 0; const caps = SCENES.map((s, i) => {
    const next = SCENES[i + 1];
    const rd = id => (sceneReady[id] ?? sceneStart[id]);
    const a = useReal ? Math.max(0, rd(s.id) - frames[0].t) : acc;
    const b = useReal ? (next ? rd(next.id) - frames[0].t : TOTAL) : acc + s.budget; acc += s.budget;
    if (!s.cap) return null;
    const f = `cap${i}.txt`; fs.writeFileSync(path.join(work, f), s.cap, 'utf8');
    return `drawtext=fontfile='C\\:/Windows/Fonts/seguisb.ttf':textfile='${f}':fontcolor=white:fontsize=38:x=(w-text_w)/2:y=${VIEW_H}+(${BAND_H}-text_h)/2:enable='between(t,${a.toFixed(2)},${(b - 0.05).toFixed(2)})'`;
  });
  const vf = `[0:v]fps=30,tpad=stop_mode=clone:stop_duration=10,pad=1920:1080:0:0:color=0x0b1a30,${caps.filter(Boolean).join(',')},format=yuv420p,fade=t=in:st=0:d=0.3,fade=t=out:st=${TOTAL - 0.5}:d=0.5[v]`;
  execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-stream_loop', '-1', '-i', MUSIC,
    '-filter_complex', `${vf};[1:a]aresample=44100,volume=0.9,afade=t=in:d=1.2,afade=t=out:st=${TOTAL - 3}:d=3[a]`,
    '-map', '[v]', '-map', '[a]', '-dn', '-t', String(TOTAL), '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', OUT],
    { stdio: 'inherit', cwd: work });
  console.log('OK', OUT);
})().catch(e => { console.error(e); process.exit(1); });
