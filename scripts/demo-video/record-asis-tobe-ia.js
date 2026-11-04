// [2026-10-27] Criado (v2 "IA"): versão do vídeo AS-IS/TO-BE com a GERAÇÃO AUTOMÁTICA de processo a partir do requisito (REQ-003) — Rafael Brito
//   Roteiro: AS-IS/TO-BE no requisito -> Comparar -> Processos > "Gerar a partir de requisitos" (IA monta raias/decisão/subprocesso) ->
//   vínculo ao requisito -> ajuste pela paleta e pelo "+" -> versionamento (v1 gerado, v2 revisado, cada uma com seu r).
//   Requer ANTHROPIC_API_KEY em backend/.env.demo (o ambiente isolado sobe com ele) e o backend do e2e (process-studio-env.sh up).
// [2026-10-27] (original) Criado: grava o vídeo de 45 s "AS-IS / TO-BE + processo" (agora 55 s, ritmo mais calmo p/ prospect) com o MESMO exemplo do trailer (REQ-003, Criar contrato de fornecimento) — Rafael Brito
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
const OUT = process.env.OUT_FILE || path.join(root, 'demo-video', 'Ancoro_AsIs_ToBe_IA.mp4');
const SHOTS = process.env.DEBUG_SHOTS ? path.resolve(process.env.DEBUG_SHOTS) : null;
fs.mkdirSync(work, { recursive: true }); if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const framesDir = path.join(work, 'frames'); fs.rmSync(framesDir, { recursive: true, force: true }); fs.mkdirSync(framesDir, { recursive: true });
// [2026-10-27] Criado: dá textos AS-IS/TO-BE coerentes aos requisitos da JORNADA ponta a ponta (banco e2e descartável). O TO-BE alimenta a geração por IA
//   e aparece nas cenas do requisito. Fonte dos textos: asis-tobe-ia-reqs.json (mesmo conteúdo do seed de dev).
const seedJourney = async () => {
  try {
    const { PrismaClient } = require(path.join(root, 'backend', 'node_modules', '@prisma', 'client'));
    const db = new PrismaClient({ datasources: { db: { url: 'file:' + path.join(root, 'backend', 'prisma', 'e2e.db').replace(/\\/g, '/') } } });
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'asis-tobe-ia-reqs.json'), 'utf8'));
    for (const [reqId, f] of Object.entries(data)) {
      const r = await db.requirement.findFirst({ where: { reqId } });
      if (r) await db.requirement.update({ where: { id: r.id }, data: f });
    }
    await db.$disconnect();
  } catch (e) { console.log('AVISO: não atualizei os requisitos da jornada (', String(e.message).split('\n')[0], ')'); }
};
const JOURNEY = ['REQ-001', 'REQ-004', 'REQ-003', 'REQ-002', 'REQ-005', 'REQ-011', 'REQ-019'];
const rawSleep = ms => new Promise(r => setTimeout(r, ms));
const sleep = rawSleep;

const VIEW_H = 1000, BAND_H = 80; // app em 1920x1000 + faixa de legenda de 80 px = 1080
// orçamento (s) e legenda (faixa inferior) por cena — soma 55
const SCENES = [
  { id: 'hook', budget: 4.6, cap: 'Antes de construir, é preciso comparar.' },
  { id: 'view', budget: 8.0, cap: 'No requisito: como é hoje (AS-IS) e como será (TO-BE)' },
  { id: 'compare', budget: 8.2, cap: 'Na lateral: alterne AS-IS e TO-BE e compare campo a campo' },
  { id: 'generate', budget: 36.0, cap: 'De vários requisitos a um processo ponta a ponta, gerado automaticamente' },
  { id: 'link', budget: 5.0, cap: 'Cada passo nasce vinculado ao requisito de origem' },
  { id: 'draw', budget: 14.6, cap: 'Ou desenhe manualmente: paleta à esquerda e + a partir de qualquer elemento' },
  { id: 'versions', budget: 15.6, cap: 'Salvar grava o processo (r); a versão é um marco com o r registrado' },
  { id: 'outro', budget: 4.0, cap: 'Ancora ReqOps Method' },
];
const BUDGET = Object.fromEntries(SCENES.map(s => [s.id, s.budget]));
const TOTAL = SCENES.reduce((a, s) => a + s.budget, 0);

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
  { side: 'r', who: 'Consultor', av: 'C', color: '#14b8a6', text: 'Vou mostrar o comparativo entre o AS-⁠IS, TO-⁠BE e o processo.', at: 1400 },
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

  await seedJourney();
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

  // 4) GERAÇÃO AUTOMÁTICA: Processos -> "Gerar a partir de requisitos" -> escolhe o REQ-003 -> a IA monta o processo (raias, decisão, subprocesso)
  // [2026-10-27] Criado: cena nova (pedido do Rafael) — mostra a geração por IA a partir do requisito — Rafael Brito
  let fr;
  const nodeBox = async id => { const b = await fr.locator(`[data-id="${id}"]`).first().boundingBox(); if (!b) throw new Error('sem nó ' + id); return b; };
  const ids = async () => fr.locator('svg.canvas .node').evaluateAll(ns => ns.map(n => n.getAttribute('data-id')));
  const connect = async (srcId, dstId) => {
    await click(fr.locator(`[data-id="${srcId}"]`).first(), 200);
    const h = await fr.locator('[data-handle="connect"]').first().boundingBox();
    const d = await nodeBox(dstId);
    await move(h.x + h.width / 2, h.y + h.height / 2, 200); await p.mouse.down();
    await p.mouse.move(d.x + d.width / 2, d.y + d.height / 2, { steps: 14 }); await p.mouse.up(); mx = d.x + d.width / 2; my = d.y + d.height / 2; await sleep(150);
  };
  // insere um elemento da PALETA (clique na ferramenta + clique no diagrama) e dá nome; devolve o id do nó criado
  const addFromPalette = async (tool, label, atX, atY) => {
    const before = await ids();
    await click(fr.locator(`[data-tool="${tool}"]`).first(), 220);
    await clickXY(atX, atY, 250); await sleep(150);
    const made = (await ids()).find(i => !before.includes(i));
    if (!made) throw new Error('nó não criado: ' + tool);
    if (label) { await p.keyboard.type(label, { delay: 16 }); await p.keyboard.press('Enter'); await sleep(150); }
    return made;
  };
  // cria pelo "+" do elemento selecionado: o novo nó já vem conectado; tarefas/gateways abrem a edição inline do nome
  const quickAdd = async (srcId, tool, label) => {
    const before = await ids();
    await click(fr.locator(`[data-id="${srcId}"]`).first(), 220);
    await click(fr.locator('[data-handle="quick"]').first(), 220);
    await click(fr.locator(`[data-quick="${tool}"]`).first(), 220); await sleep(150);
    const made = (await ids()).find(i => !before.includes(i));
    if (!made) throw new Error('nó não criado pelo "+": ' + tool);
    if (label) { await p.keyboard.type(label, { delay: 16 }); await p.keyboard.press('Enter'); await sleep(150); }
    return made;
  };
  const saveVersion = async (label, expect) => {
    await click(fr.locator('[data-action="host-versions"]').first(), 250); await sleep(350);
    await click(fr.locator('[data-testid="versions-dialog"] input').first(), 200);
    await p.keyboard.type(label, { delay: 22 });
    await click(fr.locator('[data-action="version-snapshot"]').first(), 250);
    await fr.waitForSelector(`[data-testid="versions-dialog"] li[data-version="${expect}"]`, { timeout: 8000 });
  };

  let waitA = 0, waitB = 0; // intervalo (s, relógio dos quadros) da espera real da IA — acelerado na montagem
  await scene('generate', async mark => {
    await click(p.locator('button:has-text("Processos"), a:has-text("Processos")').first(), 300);
    await p.waitForURL('**/processes', { timeout: 10000 }); await p.waitForSelector('[data-testid="generate-open"]'); await hideBanner(); mark();
    await sleep(500);
    await click(p.locator('[data-testid="generate-open"]'), 300);
    await p.waitForSelector('[data-testid="generate-dialog"]'); await p.waitForSelector('input[data-req="REQ-003"]'); await sleep(500);
    // jornada ponta a ponta: vários requisitos de uma vez (TO-BE é o padrão); a IA une tudo num processo só
    for (const id of JOURNEY) await click(p.locator(`input[data-req="${id}"]`), 170);
    await sleep(500);
    await click(p.locator('[data-testid="generate-name"]'), 200);
    await p.keyboard.type('Jornada do cliente: da adesão à leitura', { delay: 14 }); await sleep(300);
    await click(p.locator('[data-testid="generate-confirm"]'), 300);                     // a IA monta o rascunho (espera real da API)
    waitA = Date.now() / 1000;
    await p.waitForURL(/\/processes\/.+/, { timeout: 120000 });
    fr = await (await p.waitForSelector('iframe[data-testid="process-editor"]')).contentFrame();
    await fr.waitForSelector('svg.canvas .node', { timeout: 30000 });
    waitB = Date.now() / 1000; await sleep(700);
    await move(1100, 520, 300); await sleep(2200);                                       // visão geral: o processo ponta a ponta com raias, decisões e subprocessos
    // [2026-10-27] o processo tem ~24 elementos: aproxima (roda do mouse ancorada no cursor) e passeia arrastando o fundo, para dar para LER
    await move(760, 545, 250); await p.mouse.wheel(0, -520); await sleep(1700);
    await move(1250, 230, 200); await p.mouse.down(); await p.mouse.move(520, 230, { steps: 28 }); await p.mouse.up(); mx = 520; my = 230; await sleep(1400);
    await click(fr.locator('button:has-text("Enquadrar")').first(), 250); await sleep(500);
  });

  // 5) rastreabilidade: o passo gerado já nasce vinculado ao requisito
  await scene('link', async mark => {
    mark();
    const task = fr.locator('svg.canvas .node[data-kind="task"]').first();
    await click(task, 300);
    await click(fr.locator('[data-tab="links"]').first(), 250); await sleep(2200);       // aba Vínculos: requisito de origem
    // [2026-10-27] Removido: marco "Gerado por IA" e edição manual DO processo gerado — Rafael Brito. Motivo: o gerado fica intacto;
    // a forma manual agora é mostrada num processo NOVO, criado do zero (cena 'draw').
  });

  // 6) FORMA MANUAL: um processo NOVO, desenhado do zero — arrasta da paleta, conecta pela seta e cria pelo "+" a partir de um elemento
  // [2026-10-27] Alterado: o processo gerado automaticamente fica como está; a forma manual vira um segundo processo (pedido do Rafael) — Rafael Brito
  let manual = {};
  await scene('draw', async mark => {
    mark();
    await click(p.locator('input[placeholder^="Nome do novo"]'), 250);
    await p.keyboard.type('Aprovação de crédito', { delay: 18 });
    const before = p.url();
    await click(p.locator('[data-testid="new-process-create"]'), 250);
    await p.waitForFunction(u => location.href !== u, before, { timeout: 15000 });
    fr = await (await p.waitForSelector('iframe[data-testid="process-editor"]')).contentFrame();
    await fr.waitForSelector('svg.canvas .node', { timeout: 20000 }); await sleep(600);
    // o editor enquadra o processo novo (só o início) em zoom grande: afasta (roda do mouse) e leva o início para a esquerda — gestos reais
    const s0 = (await ids())[0];
    let sb = await nodeBox(s0); const startModelW = 36;
    await move(sb.x + sb.width / 2, sb.y + sb.height / 2, 200); await p.mouse.wheel(0, 270); await sleep(300);
    sb = await nodeBox(s0);
    const y = 560, k = sb.width / startModelW;
    await move(sb.x + sb.width / 2, sb.y + sb.height / 2, 150); await p.mouse.down();
    await p.mouse.move(640, y, { steps: 18 }); await p.mouse.up(); mx = 640; my = y; await sleep(200);
    sb = await nodeBox(s0);
    const step = 165 * k, x0 = sb.x + sb.width / 2;
    const t1 = await addFromPalette('task-service', 'Consultar crédito', x0 + step, y);       // 1) da paleta
    await connect(s0, t1);                                                                        // 2) conecta pela seta
    const g1 = await quickAdd(t1, 'gw-exclusive', 'Crédito aprovado?');                          // 3) "+" a partir do elemento (já conectado)
    const c = await addFromPalette('task-service', 'Criar contrato', x0 + step * 3, y);
    await connect(g1, c);
    await quickAdd(c, 'end');                                                                     // fim pelo "+" (o processo nasce completo, sem erro de validação)
    manual = { c };
  });

  // 7) versionamento (no processo manual): Salvar grava o processo (r); a versão é um marco com o r registrado
  await scene('versions', async mark => {
    mark();
    await click(fr.locator('[data-action="host-save"]').first(), 250); await sleep(800);                 // processo salvo (r sobe)
    await saveVersion('Versão inicial', 1); await sleep(1200);                                           // v1 registra o r
    await click(fr.locator('[data-testid="versions-dialog"] .modal-actions button').first(), 200); await sleep(200);
    // 2ª edição (gera o novo r): anotação arrastada da paleta e ligada à tarefa
    const cb = await nodeBox(manual.c);
    const ann = await addFromPalette('annotation', 'Alçada: gerente comercial', cb.x + cb.width / 2 + 30, cb.y - 95);
    await connect(manual.c, ann);
    await click(fr.locator('[data-action="host-save"]').first(), 250); await sleep(800);                 // novo r
    await saveVersion('Aprovado pelo cliente', 2);                                                        // v2 com o novo r
    await move(mx + 40, my + 40, 200); await sleep(2400);                                                 // lê o histórico (v2 e v1, cada uma com seu r)
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
  // [2026-10-27] espera da IA acelerada (FACTORx): comprime o relógio dos quadros no intervalo [waitA, waitB]; legendas seguem o relógio novo
  const FACTOR = 5, haveWait = waitB > waitA;
  const saved = haveWait ? (waitB - waitA) * (1 - 1 / FACTOR) : 0;
  const remap = t => (haveWait ? (t < waitA ? t : t < waitB ? waitA + (t - waitA) / FACTOR : t - saved) : t);
  const OUT_TOTAL = Math.round((TOTAL - saved) * 10) / 10;
  console.log(`espera da IA: ${(waitB - waitA).toFixed(1)} s reais -> ${((waitB - waitA) / FACTOR).toFixed(1)} s no vídeo; duração final ${OUT_TOTAL}s`);
  const lines = [];
  frames.forEach((f0, i) => { const f = { name: f0.name, t: remap(f0.t) }; const next = i + 1 < frames.length ? remap(frames[i + 1].t) : f.t + 0.04; lines.push(`file '${path.join(framesDir, f.name).replace(/\\/g, '/')}'`, `duration ${Math.max(0.001, next - f.t).toFixed(4)}`); });
  lines.push(`file '${path.join(framesDir, frames[frames.length - 1].name).replace(/\\/g, '/')}'`);
  const list = path.join(work, 'frames.txt'); fs.writeFileSync(list, lines.join('\n'));
  const off = frames[0].t - tStart / 1000; console.log('offset 1º quadro vs início das cenas:', off.toFixed(2) + 's');
  const useReal = Math.abs(off) < 2;
  let acc = 0; const caps = SCENES.map((s, i) => {
    const next = SCENES[i + 1];
    const rd = id => (sceneReady[id] ?? sceneStart[id]);
    const a = useReal ? Math.max(0, remap(rd(s.id)) - frames[0].t) : acc;
    const b = useReal ? (next ? remap(rd(next.id)) - frames[0].t : OUT_TOTAL) : acc + s.budget; acc += s.budget;
    if (!s.cap) return null;
    const f = `cap${i}.txt`; fs.writeFileSync(path.join(work, f), s.cap, 'utf8');
    return `drawtext=fontfile='C\\:/Windows/Fonts/seguisb.ttf':textfile='${f}':fontcolor=white:fontsize=38:x=(w-text_w)/2:y=${VIEW_H}+(${BAND_H}-text_h)/2:enable='between(t,${a.toFixed(2)},${(b - 0.05).toFixed(2)})'`;
  });
  if (haveWait) {  // selo discreto no canto: a espera foi acelerada (honestidade com o prospect)
    const wa = waitA - frames[0].t, wb = waitA + (waitB - waitA) / FACTOR - frames[0].t;
    fs.writeFileSync(path.join(work, 'speed.txt'), `geração acelerada ${FACTOR}x`, 'utf8');
    caps.push(`drawtext=fontfile='C\\:/Windows/Fonts/seguisb.ttf':textfile='speed.txt':fontcolor=white:fontsize=30:box=1:boxcolor=0x0b1a30@0.75:boxborderw=10:x=w-text_w-40:y=36:enable='between(t,${wa.toFixed(2)},${wb.toFixed(2)})'`);
  }
  const vf = `[0:v]fps=30,tpad=stop_mode=clone:stop_duration=10,pad=1920:1080:0:0:color=0x0b1a30,${caps.filter(Boolean).join(',')},format=yuv420p,fade=t=in:st=0:d=0.3,fade=t=out:st=${OUT_TOTAL - 0.5}:d=0.5[v]`;
  execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-stream_loop', '-1', '-i', MUSIC,
    '-filter_complex', `${vf};[1:a]aresample=44100,volume=0.9,afade=t=in:d=1.2,afade=t=out:st=${OUT_TOTAL - 3}:d=3[a]`,
    '-map', '[v]', '-map', '[a]', '-dn', '-t', String(OUT_TOTAL), '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', OUT],
    { stdio: 'inherit', cwd: work });
  console.log('OK', OUT);
})().catch(e => { console.error(e); process.exit(1); });
