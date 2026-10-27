// [2026-10-26] Criado: grava do zero o trailer de 45 s (integração entre requisitos + aprovação/alteração rastreável + comentários) — Rafael Brito
// [2026-10-26] Removido: trailer-45s.js — recortava o demo antigo e vazou o cartão do setor "Criando um requisito"; este script grava telas novas.
// [2026-10-26] Alterado (feedback do Rafael, rodada 2):
//   - Legenda saiu de dentro da tela: o app é gravado em 1920x1000 e a legenda vai numa faixa de 80 px abaixo (pad + drawtext na montagem),
//     então nada cobre a ferramenta.
//   - Removido "Caminho Crítico" do roteiro: o botão existe em DependencyGraph.tsx mas nunca recebe criticalPath/criticalEdges
//     (props opcionais com default vazio) — clicar não desenha nada. Não mostramos função que não existe. Cena do grafo agora usa
//     o destaque de dependências ao clicar num requisito + filtro por módulo.
//   - Abertura (conversa de chat digitada) e fecho (marca + assinatura) refeitos com voz humana, no lugar do cartão genérico.
// [2026-10-26] Alterado: logo via /logo.png (frontend/public/logo.svg é um PNG com extensão errada e não carrega como <img>); cursor oculto nas telas de abertura/fecho
// [2026-10-26] Alterado (rodada 3): fecho = "Defina. Conecte. Valide. Rastreie."; assinatura "Criado por Rafael Brito" removida; logo-new.png (transparente) em 230 px de altura, sem caixa branca
// [2026-10-26] Alterado: legenda aparece só quando a tela da cena está visível (mark() por cena)
// [2026-10-26] Alterado (rodada 4): quem pergunta (Rafael Brito, consultoria) e quem aprova (Ana Costa, CLIENT) agora são pessoas diferentes —
//   duas sessões, screencast trocado de página na cena 'swap'. Requisito do roteiro: REQ-003 (a Ana só enxerga requisitos Validados).
//   Abertura com o diálogo definido pelo Rafael.
// [2026-10-26] Alterado (rodada 5): o trailer começa pela pergunta "quando foi modificado?" — consultor abre o histórico do REQ-003
//   (seed-history.js cria 3 alterações reais via API, com datas recuadas), depois mostra as ligações, grafo, comentário e aprovação.
// [2026-10-26] Removido: botão "Solicite o piloto" do cartão final — sem domínio nem infra de contratação ainda; o trailer é só apresentação (decisão do Rafael)
// Uso:
//   scripts/e2e/process-studio-env.sh up        # backend :3100 + frontend :5199 (SQLite descartável, dados demo)
//   NODE_PATH=<dir c/ playwright> node scripts/demo-video/record-trailer.js [workDir]
//   (reexecutar: scripts/e2e/process-studio-env.sh reset  -> banco pristino; o roteiro altera o REQ-003)
// Decisões:
//  - Mesmo mecanismo do record.js (screencast CDP JPEG + cursor/ripple injetados no DOM), sem narração.
//  - Cada cena tem orçamento fixo (SCENES[].budget), soma 45 s; a ação roda e a cena completa o restante. Estourou? aviso no log.
//  - Dados 100% do seed demo (Distribuidora Demo Energia), banco descartável. Faixa "MODO DEMO" escondida só na gravação.
//  - Roteiro usa o REQ-003: relações -> comentário (dúvida, Rafael) -> [troca de sessão] -> resposta/aprovação (Ana, cliente) -> histórico.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..', '..');
const work = path.resolve(process.argv[2] || path.join(root, 'demo-video', '.trailer-rec'));
const B = process.env.ANCORO_URL || 'http://localhost:5199';
const MUSIC = path.join(root, 'AncoroSong_sem_fala.mp3');
const OUT = path.join(root, 'demo-video', 'Ancoro_Trailer_45s.mp4');
fs.mkdirSync(work, { recursive: true });
const framesDir = path.join(work, 'frames'); fs.rmSync(framesDir, { recursive: true, force: true }); fs.mkdirSync(framesDir, { recursive: true });
const rawSleep = ms => new Promise(r => setTimeout(r, ms));
const sleep = rawSleep;

const VIEW_H = 1000, BAND_H = 80; // app em 1920x1000 + faixa de legenda de 80 px = 1080
// orçamento (s) e legenda (faixa inferior) por cena — soma 45
const SCENES = [
  { id: 'hook', budget: 4.8, cap: 'Em todo projeto SAP, as mesmas perguntas.' },
  { id: 'hist1', budget: 6.3, cap: 'Quando mudou? O histórico mostra quem alterou, quando e o quê' },
  { id: 'rel', budget: 3.2, cap: 'E o que está ligado a ele? De quem depende e para quem fornece' },
  { id: 'graph', budget: 7.3, cap: 'No grafo, o mesmo requisito e tudo o que ele afeta' },
  { id: 'comment', budget: 7.2, cap: 'Dúvidas e decisões ficam no próprio requisito' },
  { id: 'swap', budget: 1.0, cap: '' }, // troca de sessão: consultoria -> cliente (cartão cobre a transição)
  { id: 'approve', budget: 11.0, cap: 'O cliente responde e aprova; tudo fica no histórico' },
  { id: 'outro', budget: 4.2, cap: 'Ancora ReqOps Method' },
];
const BUDGET = Object.fromEntries(SCENES.map(s => [s.id, s.budget]));
const TOTAL = SCENES.reduce((a, s) => a + s.budget, 0);
if (Math.abs(TOTAL - 45) > 0.01) throw new Error('orçamento deve somar 45 s, soma ' + TOTAL);

const INIT = () => {
  if (window !== window.top) return;
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
#__chat{width:860px;display:flex;flex-direction:column;gap:22px}
.__row{display:flex;align-items:flex-end;gap:14px;opacity:0;transform:translateY(14px);transition:opacity .25s,transform .25s}
.__row.in{opacity:1;transform:none}
.__row.r{flex-direction:row-reverse}
.__av{flex:none;width:48px;height:48px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:17px;color:#fff}
.__row.r .__col{display:flex;flex-direction:column;align-items:flex-end}
.__who{font-size:15px;color:#6b7c8f;margin:0 6px 6px;font-weight:600}
.__b{max-width:620px;padding:18px 24px;border-radius:22px;font-size:34px;line-height:1.3;font-weight:500;box-shadow:0 2px 8px rgba(11,26,48,.08)}
.__row.l .__b{background:#fff;border-bottom-left-radius:6px}
.__row.r .__b{background:#0f766e;color:#fff;border-bottom-right-radius:6px}
.__dots span{display:inline-block;width:11px;height:11px;margin:0 3px;border-radius:50%;background:#fff;opacity:.5;animation:__d 1s infinite}
.__dots span:nth-child(2){animation-delay:.18s}.__dots span:nth-child(3){animation-delay:.36s}
@keyframes __d{50%{opacity:1;transform:translateY(-4px)}}
#__swap .av{width:150px;height:150px;border-radius:50%;background:#14b8a6;color:#fff;font-size:56px;font-weight:700;display:flex;align-items:center;justify-content:center;margin-bottom:22px}
#__swap h2{font-size:64px;margin:0;font-weight:800}
#__swap p{font-size:36px;margin:10px 0 0;color:#0f766e;font-weight:600}
#__outro img{height:230px;width:auto;margin-bottom:18px}
#__outro h1{font-size:104px;margin:0;font-weight:800;letter-spacing:-.02em}
#__outro .l1{font-size:58px;margin:18px 0 0;font-weight:700;color:#0f766e;text-align:center;letter-spacing:-.01em}`;
    document.head.appendChild(st);
    const w = document.createElement('div'); w.id = '__ov';
    w.innerHTML = `<svg id="__cur" viewBox="0 0 24 24"><path d="M3 2l7.5 19 2.7-7.6L21 10.7z" fill="#fff" stroke="#0b1a30" stroke-width="1.6" stroke-linejoin="round"/></svg>
<div id="__hook" class="__scr"><div id="__chat"></div></div>
<div id="__swap" class="__scr"><div class="av">AC</div><h2>Ana Costa</h2><p>Cliente · revisa e aprova</p></div>
<div id="__outro" class="__scr"><img src="/logo-new.png" alt=""><h1>Ancoro</h1>
 <div class="l1">Defina. Conecte. Valide. Rastreie.</div>
</div>`;
    document.documentElement.appendChild(w);
    const cur = document.getElementById('__cur');
    addEventListener('mousemove', e => { cur.style.transform = `translate(${e.clientX - 4}px,${e.clientY - 2}px)`; }, true);
    addEventListener('mousedown', e => { const r = document.createElement('div'); r.className = '__rip'; r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px'; document.documentElement.appendChild(r); setTimeout(() => r.remove(), 700); }, true);
  };
  window.__show = (id, on) => { mk(); document.getElementById(id).classList.toggle('on', !!on); document.getElementById('__cur').style.display = on ? 'none' : ''; }; // cursor escondido sobre as telas de abertura/fecho
  window.__showNow = id => { mk(); const e = document.getElementById(id); e.style.transition = 'none'; e.classList.add('on'); void e.offsetWidth; e.style.transition = ''; document.getElementById('__cur').style.display = 'none'; }; // liga sem fade (2ª sessão já nasce com o cartão)
  // conversa digitada: cada item = { side, who, av, color, text, at(ms), dots }
  window.__playHook = lines => {
    mk(); const chat = document.getElementById('__chat'); chat.innerHTML = '';
    lines.forEach(L => setTimeout(() => {
      const row = document.createElement('div'); row.className = '__row ' + L.side;
      row.innerHTML = `<div class="__av" style="background:${L.color}">${L.av}</div><div class="__col"><div class="__who">${L.who}</div><div class="__b"></div></div>`;
      chat.appendChild(row); requestAnimationFrame(() => row.classList.add('in'));
      const b = row.querySelector('.__b'); let i = 0;
      const tick = () => { if (i <= L.text.length) { b.textContent = L.text.slice(0, i++); setTimeout(tick, 26); } else if (L.dots) { b.insertAdjacentHTML('beforeend', ' <span class="__dots"><span></span><span></span><span></span></span>'); } };
      tick();
    }, L.at));
  };
  if (document.readyState !== 'loading') mk(); else document.addEventListener('DOMContentLoaded', mk);
};

const HOOK_LINES = [
  { side: 'l', who: 'Gerente de projeto', av: 'GP', color: '#475569', text: 'Quando o requisito foi modificado?', at: 150 },
  { side: 'r', who: 'Consultor', av: 'C', color: '#14b8a6', text: 'Boa pergunta... acho que foi no workshop.', at: 1300 },
  { side: 'l', who: 'Gerente de projeto', av: 'GP', color: '#475569', text: 'Tem algum requisito ligado a ele e foi afetado?', at: 2450 },
  { side: 'r', who: 'Consultor', av: 'C', color: '#14b8a6', text: 'Vou verificar!', at: 3900, dots: true },
];

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--hide-scrollbars', '--headless=new'] });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: VIEW_H }, deviceScaleFactor: 1, locale: 'pt-BR' });
  await ctx.addInitScript(INIT);
  // [2026-10-26] Duas sessões: p1 = Rafael Brito (MANAGER, consultoria) pergunta; p2 = Ana Costa (CLIENT) aprova.
  // O screencast é trocado de página no meio (mesmo relógio de quadros), coberto por um cartão — sem deslogar/relogar em cena.
  // contextos SEPARADOS: localStorage (token) é por contexto; num só contexto o login da Ana derrubaria a sessão do Rafael
  const ctx2 = await browser.newContext({ viewport: { width: 1920, height: VIEW_H }, deviceScaleFactor: 1, locale: 'pt-BR' });
  await ctx2.addInitScript(INIT);
  const p1 = await ctx.newPage(), p2 = await ctx2.newPage();
  let p = p1;
  for (const pg of [p1, p2]) pg.on('pageerror', e => console.log('PAGEERROR', e.message));
  const cdp = await ctx.newCDPSession(p1), cdp2 = await ctx2.newCDPSession(p2);
  const frames = []; let fi = 0;
  const onFrame = c => async f => {
    const name = String(fi++).padStart(6, '0') + '.jpg';
    fs.writeFileSync(path.join(framesDir, name), Buffer.from(f.data, 'base64'));
    frames.push({ name, t: f.metadata.timestamp });
    c.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  };
  cdp.on('Page.screencastFrame', onFrame(cdp)); cdp2.on('Page.screencastFrame', onFrame(cdp2));
  const startCast = c => c.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: VIEW_H, everyNthFrame: 1 });

  // ---- helpers ----
  let mx = 960, my = 500;
  const move = async (x, y, ms = 500) => {
    const steps = Math.max(6, Math.min(30, Math.round(Math.hypot(x - mx, y - my) / 24)));
    await p.mouse.move(x, y, { steps }); mx = x; my = y; await sleep(ms * 0.2);
  };
  const center = async loc => { await loc.scrollIntoViewIfNeeded().catch(() => {}); await rawSleep(200); const b = await loc.boundingBox(); if (!b) throw new Error('sem bbox'); return [b.x + b.width / 2, b.y + b.height / 2]; };
  const hover = async loc => { const [x, y] = await center(loc); await move(x, y); };
  const click = async loc => { await hover(loc); await sleep(80); await p.mouse.down(); await sleep(50); await p.mouse.up(); await sleep(180); };
  const clickXY = async (x, y) => { await move(x, y); await sleep(80); await p.mouse.down(); await sleep(50); await p.mouse.up(); await sleep(180); };
  const type = async (loc, text, d = 18) => { await click(loc); await loc.focus(); await p.keyboard.type(text, { delay: d }); await sleep(200); };
  const hideBanner = () => p.evaluate(() => { for (const d of document.querySelectorAll('div.fixed')) if (/MODO DEMO/.test(d.textContent || '') && d.textContent.length < 120) d.style.display = 'none'; });
  const show = (id, on) => p.evaluate(a => window.__show(...a), [id, on]).catch(() => {});
  const timeline = {}, sceneStart = {}, sceneReady = {}; // sceneReady: instante em que a tela da cena já está visível (a legenda só entra aí)
  const scene = async (id, act) => {
    const t0 = Date.now(); sceneStart[id] = t0 / 1000;
    await Promise.resolve(act(() => { sceneReady[id] = Date.now() / 1000; })).catch(e => console.log('ERRO cena ' + id + ': ' + String(e.message).split('\n')[0]));
    const used = (Date.now() - t0) / 1000;
    console.log(`cena ${id}: ação ${used.toFixed(1)} s / orçamento ${BUDGET[id]} s${used > BUDGET[id] ? '  <-- ESTOUROU' : ''}`);
    const rest = BUDGET[id] * 1000 - (Date.now() - t0); if (rest > 0) await rawSleep(rest);
    timeline[id] = (Date.now() - t0) / 1000;
  };

  await require('./seed-history')('REQ-003'); // histórico de alterações realista (banco descartável)

  // ---- logins (fora da gravação) ----
  const login = async (pg, email) => {
    await pg.goto(B + '/login', { waitUntil: 'domcontentloaded' }); await pg.waitForSelector('input[type=email]');
    await pg.fill('input[type=email]', email); await pg.fill('input[type=password]', 'demo123');
    await pg.click('button:has-text("Entrar")'); await pg.waitForURL('**/dashboard'); await pg.waitForSelector('tbody tr'); await pg.waitForTimeout(2500);
    await pg.evaluate(() => { for (const d of document.querySelectorAll('div.fixed')) if (/MODO DEMO/.test(d.textContent || '') && d.textContent.length < 120) d.style.display = 'none'; });
  };
  await login(p2, 'ana.costa@cliente.com');   // cliente: só enxerga requisitos Validados (por isso o roteiro usa o REQ-003)
  await login(p1, 'rafael.brito@ancoro.com');
  await p1.bringToFront();
  const row = n => p.locator('tbody tr').nth(n);
  const openReq = async n => { const r = row(n); await r.hover(); await click(r.locator('td').first()); await p.waitForSelector('text=Detalhes', { timeout: 8000 }).catch(() => {}); await sleep(450); };
  const tab = name => click(p.locator(`button:has-text("${name}")`).first());

  await show('__hook', true); await rawSleep(500); // tela clara de abertura já no ar antes do 1º frame
  await startCast(cdp);
  const tStart = Date.now();

  // 1) abertura: conversa que todo consultor já viveu
  await scene('hook', async mark => { mark(); await p.evaluate(l => window.__playHook(l), HOOK_LINES); });
  await show('__hook', false);

  // 2) a pergunta inicial era "quando mudou?": o consultor abre o requisito e consulta o histórico de alterações
  await scene('hist1', async mark => {
    await move(900, 700, 300);
    await openReq(2); mark();                                      // REQ-003 — Criar contrato de fornecimento (Validado)
    await tab('Histórico'); await sleep(900);
    await move(960, 470, 300); await sleep(900); await move(960, 560, 300); await sleep(800); await move(960, 650, 300); await sleep(500);
  });

  // 2b) "e o que está ligado a ele?": aba Detalhes (modal continua aberto) -> Depende de / Fornece para
  await scene('rel', async mark => {
    mark(); await tab('Detalhes');
    const dep = await p.locator('text=Depende de').first().boundingBox();
    const forn = await p.locator('text=Fornece para').first().boundingBox();
    await move(dep.x + 40, dep.y + 32, 300); await sleep(500);
    await move(forn.x + 40, forn.y + 32, 300); await sleep(400);
  });

  // 3) grafo: o MESMO requisito da história (REQ-003) — zoom sobre ele, clique destaca a cadeia de dependências,
  //    e o link "Ver requisito no Dashboard" do popup leva de volta à grade (transição real da UI, sem corte).
  //    Coordenadas: com viewport 1920x1000 o REQ-003 fica em (487,490) no zoom inicial (52%); o zoom ancora no cursor.
  await scene('graph', async mark => {
    await p.keyboard.press('Escape'); await sleep(300);
    await click(p.locator('a:has-text("Grafo"), button:has-text("Grafo")').first());
    await p.waitForURL('**/dependency-graph', { timeout: 10000 }); await hideBanner(); mark(); await sleep(700);
    await move(487, 490, 300);
    for (let i = 0; i < 3; i++) { await p.mouse.wheel(0, -240); await sleep(200); }
    await sleep(300);
    await clickXY(487, 490); await sleep(2300);                      // REQ-003: destaca dependências (entrada) e fornecimentos (saída)
    await click(p.locator('a:has-text("Ver requisito no Dashboard")').first());
    await p.waitForURL('**/dashboard', { timeout: 10000 }); await p.waitForSelector('tbody tr'); await hideBanner();
  });

  // 4) comentário (dúvida) no próprio requisito
  await scene('comment', async mark => {
    mark(); await openReq(2); await tab('Comentários');           // já estamos no dashboard (link do popup do grafo); legenda troca assim que a grade aparece
    await click(p.locator('button:has-text("Dúvida")').first());
    await type(p.locator('textarea[placeholder^="Adicionar novo"]'), 'O novo prazo de ativação está correto?', 14);
    await click(p.locator('button:has-text("Enviar Comentário")')); await sleep(300);
  });

  // 4b) troca de sessão: a consultoria perguntou; agora quem aprova é o CLIENTE (Ana Costa) — pessoa diferente de quem perguntou
  await scene('swap', async mark => {
    mark(); await show('__swap', true); await rawSleep(330);          // fade-in do cartão na sessão da consultoria
    await cdp.send('Page.stopScreencast');
    await p2.evaluate(() => window.__showNow('__swap')); await p2.bringToFront();
    p = p2; mx = 960; my = 500;
    await startCast(cdp2); await rawSleep(150);
    await show('__swap', false);                                        // fade-out já na sessão do cliente (termina dentro da próxima cena)
  });

  // 5) aprovação pelo cliente. [2026-10-26] Alterado: no perfil CLIENT o detalhe é somente leitura (status é texto, sem select) —
  // o cliente aprova RESPONDENDO no requisito (comentário tipo Resposta). Não simulamos mudança de status que a UI não oferece.
  await scene('approve', async mark => {
    mark(); await openReq(2); await tab('Comentários');
    await click(p.locator('button:has-text("Resposta")').first());
    await type(p.locator('textarea[placeholder^="Adicionar novo"]'), 'Prazo correto. Aprovado.', 16);
    await click(p.locator('button:has-text("Enviar Comentário")')); await sleep(600);
    await tab('Histórico'); await sleep(900); await move(960, 520, 300); await sleep(900); await move(960, 700, 400); await sleep(1100);   // tudo no histórico: alterações da consultoria + resposta do cliente (tempo de leitura)
  });

  // [2026-10-26] Removido: cena 'hist' final (histórico visto pela Ana) — o histórico agora abre o trailer (hist1) e reaparece dentro de 'approve'

  // 7) fecho
  await scene('outro', async mark => { await show('__outro', true); mark(); await sleep(600); await p.keyboard.press('Escape'); });

  await rawSleep(300);
  await cdp2.send('Page.stopScreencast');
  const tEnd = Date.now();
  fs.writeFileSync(path.join(work, 'timeline.json'), JSON.stringify({ timeline, frames: frames.length, seconds: (tEnd - tStart) / 1000 }));
  console.log('frames', frames.length, 'cenas', JSON.stringify(timeline), 'duração real', ((tEnd - tStart) / 1000).toFixed(1) + 's');
  await browser.close();

  // ---- montagem: frames (durations irregulares) -> 30 fps CFR + faixa de legenda + trilha base, corte exato em 45 s ----
  const lines = [];
  frames.forEach((f, i) => { const next = i + 1 < frames.length ? frames[i + 1].t : f.t + 0.04; lines.push(`file '${path.join(framesDir, f.name).replace(/\\/g, '/')}'`, `duration ${Math.max(0.001, next - f.t).toFixed(4)}`); });
  lines.push(`file '${path.join(framesDir, frames[frames.length - 1].name).replace(/\\/g, '/')}'`);
  const list = path.join(work, 'frames.txt'); fs.writeFileSync(list, lines.join('\n'));
  // legendas: um textfile por cena. [2026-10-26] Alterado: janelas pelos inícios REAIS das cenas (relógio do screencast = frames[0].t),
  // não pela soma dos orçamentos — a legenda da cena seguinte entrava ~0,5 s antes da imagem trocar.
  const off = frames[0].t - tStart / 1000; console.log('offset 1º quadro vs início das cenas:', off.toFixed(2) + 's');
  const useReal = Math.abs(off) < 2; // relógios compatíveis? senão cai no orçamento cumulativo
  let acc = 0; const caps = SCENES.map((s, i) => {
    const next = SCENES[i + 1];
    const rd = id => (sceneReady[id] ?? sceneStart[id]);
    const a = useReal ? Math.max(0, rd(s.id) - frames[0].t) : acc;
    const b = useReal ? (next ? rd(next.id) - frames[0].t : TOTAL) : acc + s.budget; acc += s.budget;
    if (!s.cap) return null;
    const f = `cap${i}.txt`; fs.writeFileSync(path.join(work, f), s.cap, 'utf8');
    return `drawtext=fontfile='C\\:/Windows/Fonts/seguisb.ttf':textfile='${f}':fontcolor=white:fontsize=38:x=(w-text_w)/2:y=${VIEW_H}+(${BAND_H}-text_h)/2:enable='between(t,${a.toFixed(2)},${(b - 0.05).toFixed(2)})'`;
  });
  // [2026-10-26] tpad estende o último quadro (o screencast só emite quadros quando a tela muda; sem isso o cartão final sumia)
  const vf = `[0:v]fps=30,tpad=stop_mode=clone:stop_duration=10,pad=1920:1080:0:0:color=0x0b1a30,${caps.filter(Boolean).join(',')},format=yuv420p,fade=t=in:st=0:d=0.3,fade=t=out:st=${TOTAL - 0.5}:d=0.5[v]`;
  execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-stream_loop', '-1', '-i', MUSIC,
    '-filter_complex', `${vf};[1:a]aresample=44100,volume=0.9,afade=t=in:d=1.2,afade=t=out:st=${TOTAL - 3}:d=3[a]`,
    '-map', '[v]', '-map', '[a]', '-dn', '-t', String(TOTAL), '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', OUT],
    { stdio: 'inherit', cwd: work });
  console.log('OK', OUT);
})().catch(e => { console.error(e); process.exit(1); });
