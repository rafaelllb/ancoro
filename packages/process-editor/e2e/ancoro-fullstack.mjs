/**
 * E2E full-stack da Fase 4 (Process Studio dentro do Ancoro) num Chrome real: backend + frontend + editor embutido (iframe).
 *
 * [2026-10-15] Criado: etapa 4 — fluxo completo (listar, editar com vínculo de requisito, salvar, cobertura, conflito, versões,
 *   redimensionar, publicar) + matriz de papéis (ADMIN, MANAGER, CONSULTANT, CLIENT) — Rafael Brito
 *
 * Pré-requisitos (veja README Process Studio §6.4):
 *   - backend com dados demo em API (padrão http://localhost:3100), frontend em FRONT (padrão http://localhost:5199)
 *   - editor compilado em frontend/public/process-studio  (npm run build:process-studio)
 * Uso: node e2e/ancoro-fullstack.mjs      Env: FRONT, API, CHROME
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const FRONT = process.env.FRONT ?? 'http://localhost:5199';
const API = process.env.API ?? 'http://localhost:3100';
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PASSWORD = 'demo123';
mkdirSync('e2e/out', { recursive: true });

let failed = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ' + extra}`);
  if (!cond) failed++;
};
const settle = (ms = 150) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1600, height: 950 } });
const errors = [];

/** Sessão isolada (contexto próprio = localStorage próprio) logada na UI com o e-mail dado. */
async function session(email) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[${email}] ${e}`));
  page.on('dialog', (d) => d.accept());
  await page.goto(`${FRONT}/login`, { waitUntil: 'networkidle0' });
  await page.type('#email', email);
  await page.type('#password', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => !!localStorage.getItem('token'), { timeout: 15000 });
  await page.waitForFunction(() => location.pathname !== '/login', { timeout: 15000 });
  return page;
}

/** fetch autenticado dentro da página (usa o token que o Ancoro guardou) */
const api = (page, method, path, body) => page.evaluate(async (API, method, path, body) => {
  const r = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` }, body: body ? JSON.stringify(body) : undefined });
  const ct = r.headers.get('content-type') ?? '';
  const data = ct.includes('json') ? await r.json() : ct.includes('zip') ? Array.from(new Uint8Array(await r.arrayBuffer()).slice(0, 2)) : await r.text();
  return { status: r.status, data };
}, API, method, path, body);

const projectOf = async (page) => (await api(page, 'GET', '/api/projects')).data;
const editorFrame = async (page) => {
  await page.waitForSelector('iframe[data-testid="process-editor"]', { timeout: 15000 });
  const handle = await page.$('iframe[data-testid="process-editor"]');
  const frame = await handle.contentFrame();
  await frame.waitForSelector('[data-id]', { timeout: 20000 }); // diagrama desenhado = processo carregado pela ponte
  await settle(300);
  return frame;
};
const openProcessByName = async (page, name) => {
  await page.waitForSelector('[data-testid="process-list"] li', { timeout: 15000 });
  const clicked = await page.evaluate((name) => {
    const li = [...document.querySelectorAll('[data-testid="process-list"] li')].find((x) => x.textContent.includes(name));
    li?.querySelector('[data-action="open-process"]')?.click();
    return !!li;
  }, name);
  if (!clicked) throw new Error(`processo "${name}" não está na lista`);
  return editorFrame(page);
};
const count = (page, sel) => page.$$eval(sel, (els) => els.length);
const drag = async (page, from, to, steps = 10) => {
  await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps }); await page.mouse.up();
};
const center = async (el) => { const b = await el.boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };

/** vincula um requisito ao elemento selecionado pelo seletor do editor (RPC de busca -> API) */
async function linkRequirement(frame, reqId) {
  await frame.click('[data-tab="links"]');
  await settle(100);
  await frame.click('[data-testid="req-search"]');
  await frame.type('[data-testid="req-search"]', reqId);
  await frame.waitForSelector(`[data-req="${reqId}"]`, { timeout: 8000 });
  await frame.click(`[data-req="${reqId}"]`);
  await settle(200);
}
const clickFirstTask = async (frame) => {
  const el = await frame.$('svg.canvas .node[data-kind="task"] rect.shape');
  const p = await center(el);
  await frame.page().mouse.click(p.x, p.y);
  await settle(250);
  if (!(await frame.$('[data-tab="links"]'))) console.log('DEBUG sem seleção:', JSON.stringify(p), await frame.$eval('#ps-state', (e) => e.getAttribute('data-state')), await frame.evaluate((x, y) => document.elementFromPoint(x, y)?.outerHTML.slice(0, 100), p.x, p.y));
  return frame.$eval('svg.canvas .node[data-kind="task"]', (n) => n.getAttribute('data-id'));
};

try {
  // =================================================================== 1. MANAGER: fluxo principal
  console.log('--- MANAGER (rafael.brito@ancoro.com): fluxo principal');
  const mgr = await session('rafael.brito@ancoro.com');
  const projects = await projectOf(mgr);
  const proj = (projects.data ?? projects).find((p) => p.name.includes('S/4 HANA')) ?? (projects.data ?? projects)[0];
  await mgr.evaluate((id) => localStorage.setItem('ancoro_current_project_id', id), proj.id);
  const P = `/api/projects/${proj.id}`;
  await mgr.goto(`${FRONT}/processes`, { waitUntil: 'networkidle0' });
  await mgr.waitForSelector('[data-testid="process-list"] li', { timeout: 15000 });
  const demoName = await mgr.$eval('[data-testid="process-list"] li span.font-medium', (e) => e.textContent);
  check('lista mostra o processo de exemplo do seed', !!demoName, demoName);
  const cov0 = (await api(mgr, 'GET', `${P}/processes/coverage`)).data;
  check('cobertura inicial: poucos requisitos cobertos', cov0.covered > 0 && cov0.covered < cov0.total, JSON.stringify([cov0.covered, cov0.total]));
  check('painel de cobertura aparece na página', (await count(mgr, '[data-testid="coverage-summary"]')) === 1);
  await mgr.screenshot({ path: 'e2e/out/f4-01-lista.png' });

  let frame = await openProcessByName(mgr, demoName);
  check('o editor embutido carrega o diagrama pela ponte (nós desenhados)', (await frame.$$('svg.canvas .node')).length >= 10);
  check('modo host: sem botões locais (Novo/Abrir/Exemplo)', (await frame.$('[data-action="new"]')) === null && (await frame.$('[data-action="sample"]')) === null);
  check('MANAGER não vê "somente leitura"', (await frame.$('[data-testid="ro-badge"]')) === null);
  check('botão Salvar começa desabilitado (nada alterado)', await frame.$eval('[data-action="host-save"]', (b) => b.disabled));
  await mgr.screenshot({ path: 'e2e/out/f4-02-editor.png' });

  // ---- vincular requisito + salvar
  const targetReq = 'REQ-050';
  const taskId = await clickFirstTask(frame);
  await linkRequirement(frame, targetReq);
  check('vínculo adicionado aparece como chip', (await frame.$$eval('.req-picker .tag', (t) => t.map((x) => x.textContent))).some((x) => x.includes(targetReq)));
  check('badge "alterações não salvas" aparece', (await frame.$('[data-testid="dirty-badge"]')) !== null);
  await frame.click('[data-action="host-save"]');
  await frame.waitForFunction(() => !document.querySelector('[data-testid="dirty-badge"]'), { timeout: 8000 });
  const rev1 = await frame.$eval('header .muted', (e) => e.textContent);
  check('salvar limpa o badge e a revisão sobe (r2)', rev1 === 'r2', rev1);
  const list1 = (await api(mgr, 'GET', `${P}/processes`)).data.processes;
  const demo = list1.find((p) => p.name === demoName);
  const saved = (await api(mgr, 'GET', `${P}/processes/${demo.id}`)).data;
  check('o servidor tem o vínculo no modelo', saved.model.nodes.find((n) => n.id === taskId).requirementRefs.includes(targetReq));
  const cov1 = (await api(mgr, 'GET', `${P}/processes/coverage`)).data;
  check('cobertura aumentou em 1 (projeção de vínculos reconstruída)', cov1.covered === cov0.covered + 1, `${cov0.covered} -> ${cov1.covered}`);
  const reqRow = (await api(mgr, 'GET', `${P}/process-requirements?q=${targetReq}`)).data.requirements.find((r) => r.reqId === targetReq);
  const rp = (await api(mgr, 'GET', `${P}/requirements/${reqRow.id}/processes`)).data.links;
  check('"em quais processos este requisito aparece" retorna o processo', rp.some((l) => l.processId === demo.id && l.elementId === taskId));

  // ---- redimensionar dentro do editor embutido e salvar
  await clickFirstTask(frame);
  const before = saved.model.nodes.find((n) => n.id === taskId).bounds;
  const se = await frame.$('[data-handle="nresize"][data-pos="se"]');
  const sp = await center(se);
  await drag(mgr, sp, { x: sp.x + 40, y: sp.y + 30 });
  await settle(200);
  await frame.click('[data-action="host-save"]');
  await frame.waitForFunction(() => !document.querySelector('[data-testid="dirty-badge"]'), { timeout: 8000 });
  const after = (await api(mgr, 'GET', `${P}/processes/${demo.id}`)).data.model.nodes.find((n) => n.id === taskId).bounds;
  check('redimensionar (alça SE) persiste no servidor', after.w > before.w && after.h > before.h && after.x === before.x, JSON.stringify([before, after]));
  await mgr.screenshot({ path: 'e2e/out/f4-03-resize-salvo.png' });

  // ---- versões
  await frame.click('[data-action="host-versions"]');
  await frame.waitForSelector('[data-testid="versions-dialog"]');
  await frame.type('.modal input', 'Marco 1');
  await frame.click('[data-action="version-snapshot"]');
  await frame.waitForSelector('li[data-version="1"]', { timeout: 8000 });
  check('snapshot com rótulo aparece no histórico', (await frame.$eval('li[data-version="1"]', (e) => e.textContent)).includes('Marco 1'));
  // altera, salva, restaura v1
  await clickFirstTask(frame);
  const se2 = await center(await frame.$('[data-handle="nresize"][data-pos="se"]'));
  await frame.click('.modal-actions button'); // fecha o diálogo (limpa o caminho para arrastar)
  await settle(150);
  await drag(mgr, se2, { x: se2.x + 50, y: se2.y + 40 });
  await frame.click('[data-action="host-save"]');
  await frame.waitForFunction(() => !document.querySelector('[data-testid="dirty-badge"]'), { timeout: 8000 });
  const grown = (await api(mgr, 'GET', `${P}/processes/${demo.id}`)).data.model.nodes.find((n) => n.id === taskId).bounds;
  await frame.click('[data-action="host-versions"]');
  await frame.waitForSelector('li[data-version="1"] [data-action="version-restore"]');
  await settle(400); // a lista é recarregada ao abrir o diálogo: espera estabilizar
  await frame.waitForSelector('li[data-version="1"] [data-action="version-restore"]');
  await frame.$eval('li[data-version="1"] [data-action="version-restore"]', (b) => b.click()); // window.confirm aceito pelo handler
  await frame.waitForFunction(() => !document.querySelector('[data-testid="versions-dialog"]'), { timeout: 10000 });
  await settle(400);
  // [2026-10-19] Alterado: restaurar é RASCUNHO — nada no servidor muda até o Salvar manual — Rafael Brito
  const versionsBefore = (await api(mgr, 'GET', `${P}/processes/${demo.id}/versions`)).data.versions.length;
  const untouched = (await api(mgr, 'GET', `${P}/processes/${demo.id}`)).data.model.nodes.find((n) => n.id === taskId).bounds;
  check('restaurar NÃO grava no servidor (modelo continua o mais novo)', untouched.w === grown.w, JSON.stringify({ grown, untouched }));
  check('restaurar NÃO cria versão automática', versionsBefore === (await api(mgr, 'GET', `${P}/processes/${demo.id}/versions`)).data.versions.length);
  check('após restaurar o editor fica com alterações não salvas', !!(await frame.$('[data-testid="dirty-badge"]')));
  await frame.click('[data-action="host-save"]');
  await frame.waitForFunction(() => !document.querySelector('[data-testid="dirty-badge"]'), { timeout: 8000 });
  const restored = (await api(mgr, 'GET', `${P}/processes/${demo.id}`)).data.model.nodes.find((n) => n.id === taskId).bounds;
  check('Salvar manual após restaurar grava o conteúdo da versão 1', restored.w === after.w && restored.w < grown.w, JSON.stringify({ after, grown, restored }));

  // ---- conflito de versão entre duas pessoas (MANAGER x CONSULTANT)
  console.log('--- conflito de edição simultânea');
  const cons = await session('joao.silva@ancoro.com');
  await cons.evaluate((id) => localStorage.setItem('ancoro_current_project_id', id), proj.id);
  await cons.goto(`${FRONT}/processes`, { waitUntil: 'networkidle0' });
  const frameB = await openProcessByName(cons, demoName);
  await clickFirstTask(frameB);
  await linkRequirement(frameB, 'REQ-040');
  frame = await editorFrame(mgr); // recarrega o editor do gerente na revisão atual
  await clickFirstTask(frame);
  await linkRequirement(frame, 'REQ-045');
  await frame.click('[data-action="host-save"]');
  await frame.waitForFunction(() => !document.querySelector('[data-testid="dirty-badge"]'), { timeout: 8000 });
  await frameB.click('[data-action="host-save"]'); // base antiga => 409
  await frameB.waitForSelector('[data-testid="conflict-dialog"]', { timeout: 8000 });
  check('salvar com base antiga abre o diálogo de conflito (nada foi sobrescrito)', true);
  const srv = (await api(mgr, 'GET', `${P}/processes/${demo.id}`)).data.model.nodes.find((n) => n.id === taskId).requirementRefs;
  check('o servidor mantém a edição de quem salvou primeiro', srv.includes('REQ-045') && !srv.includes('REQ-040'), JSON.stringify(srv));
  await cons.screenshot({ path: 'e2e/out/f4-04-conflito.png' });
  const nBefore = (await api(cons, 'GET', `${P}/processes`)).data.processes.length;
  await frameB.click('[data-action="conflict-copy"]');
  await cons.waitForFunction((id) => !location.pathname.endsWith(id), { timeout: 10000 }, demo.id);
  await editorFrame(cons);
  const listB = (await api(cons, 'GET', `${P}/processes`)).data.processes;
  const copy = listB.find((p) => p.name.includes('(cópia)'));
  check('"salvar como cópia" cria um novo processo e navega até ele', listB.length === nBefore + 1 && !!copy && cons.url().endsWith(copy.id), cons.url());
  const copyRefs = (await api(cons, 'GET', `${P}/processes/${copy.id}`)).data.model.nodes.find((n) => n.id === taskId)?.requirementRefs ?? [];
  check('a cópia preserva a edição de quem teve o conflito', copyRefs.includes('REQ-040'), JSON.stringify(copyRefs));
  check('a cópia pertence ao CONSULTANT (pode excluí-la)', copy.canDelete === true);

  // ---- publicar
  console.log('--- publicar portal');
  await mgr.reload({ waitUntil: 'networkidle0' });
  check('MANAGER vê o botão Publicar', (await mgr.$('[data-testid="publish-open"]')) !== null);
  await mgr.click('[data-testid="publish-open"]');
  await mgr.type('[data-testid="publish-label"]', 'Release E2E');
  await mgr.click('[data-testid="publish-confirm"]');
  await mgr.waitForFunction(() => !document.querySelector('[data-testid="publish-dialog"]'), { timeout: 30000 });
  check('publicar via UI fecha o diálogo', true);
  const pub = await api(mgr, 'POST', `${P}/processes/publish`, { label: 'Release E2E 2' });
  check('API de publicar devolve ZIP (PK)', pub.status === 200 && pub.data[0] === 0x50 && pub.data[1] === 0x4b, JSON.stringify(pub));

  // =================================================================== 2. aba Processos no requisito
  console.log('--- aba "Processos" no requisito');
  await mgr.goto(`${FRONT}/dashboard`, { waitUntil: 'networkidle0' });
  await mgr.waitForSelector('tbody tr', { timeout: 20000 });
  const linkedReq = 'REQ-001'; // vinculado pelo seed (demoProcess usa os primeiros requisitos)
  const rowClicked = await mgr.evaluate((id) => {
    const tr = [...document.querySelectorAll('tbody tr')].find((r) => r.textContent.includes(id));
    if (!tr) return false;
    tr.click();
    return true;
  }, linkedReq);
  if (rowClicked) {
    await settle(400);
    const tabClicked = await mgr.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) => /Processos|Processes/.test(x.textContent) && x.className.includes('flex-1'));
      b?.click();
      return !!b;
    });
    check('requisito selecionado mostra a aba Processos', tabClicked);
    if (tabClicked) {
      await mgr.waitForSelector('[data-testid="requirement-processes"] li', { timeout: 8000 }).catch(() => undefined);
      const txt = await mgr.$eval('[data-testid="requirement-processes"]', (e) => e.textContent).catch(() => '');
      check('a aba lista o processo que referencia o requisito', txt.includes(demoName), txt);
      await mgr.screenshot({ path: 'e2e/out/f4-05-aba-processos.png' });
    }
  } else check(`linha ${linkedReq} encontrada na grade do dashboard`, false, 'grade não exibiu o requisito (paginação/filtro)');

  // =================================================================== 3. matriz de papéis
  console.log('--- matriz de papéis');
  const cli = await session('ana.costa@cliente.com');
  await cli.evaluate((id) => localStorage.setItem('ancoro_current_project_id', id), proj.id);
  await cli.goto(`${FRONT}/processes`, { waitUntil: 'networkidle0' });
  await cli.waitForSelector('[data-testid="process-list"] li', { timeout: 15000 });
  check('CLIENT: vê a lista de processos', (await count(cli, '[data-testid="process-list"] li')) >= 1);
  check('CLIENT: sem formulário de novo processo, sem importar e sem publicar',
    (await cli.$('[data-testid="new-process-name"]')) === null && (await cli.$('[data-testid="import-file"]')) === null && (await cli.$('[data-testid="publish-open"]')) === null);
  check('CLIENT: nenhum botão Excluir', (await count(cli, '[data-action="delete-process"]')) === 0);
  const fc = await openProcessByName(cli, demoName);
  check('CLIENT: editor abre em somente leitura (selo + sem Salvar)', (await fc.$('[data-testid="ro-badge"]')) !== null && (await fc.$('[data-action="host-save"]')) === null);
  check('CLIENT: sem paleta e sem desfazer/refazer', (await fc.$$eval('nav.side > *', (e) => e.length)) === 0 && (await fc.$('[data-action="undo"]')) === null);
  const tp = await center(await fc.$('svg.canvas .node[data-kind="task"] rect.shape'));
  const nb = await fc.$eval('svg.canvas .node[data-kind="task"]', (n) => n.getAttribute('data-id'));
  await cli.mouse.click(tp.x, tp.y);
  await settle(150);
  check('CLIENT: selecionar mostra propriedades mas sem alças de edição', (await fc.$$('[data-handle]')).length === 0);
  check('CLIENT: campos do painel desabilitados', await fc.$eval('fieldset.ro', (f) => f.disabled));
  await drag(cli, tp, { x: tp.x + 80, y: tp.y + 40 });
  await settle(200);
  check('CLIENT: arrastar não altera nada (sem badge de alterações)', (await fc.$('[data-testid="dirty-badge"]')) === null);
  const w1 = (await api(cli, 'PUT', `${P}/processes/${demo.id}`, { baseRev: 1, model: { id: 'x' } }));
  check('CLIENT: o servidor também recusa escrita (403)', w1.status === 403, String(w1.status));
  const w2 = await api(cli, 'POST', `${P}/processes`, { name: 'x' });
  check('CLIENT: criar via API => 403', w2.status === 403);
  await cli.screenshot({ path: 'e2e/out/f4-06-client-readonly.png' });
  void nb;

  // CONSULTANT: cria, vê só o botão excluir do próprio, não publica
  await cons.goto(`${FRONT}/processes`, { waitUntil: 'networkidle0' });
  await cons.waitForSelector('[data-testid="process-list"] li');
  check('CONSULTANT: formulário de novo processo e importar visíveis', (await cons.$('[data-testid="new-process-name"]')) !== null && (await cons.$('[data-testid="import-file"]')) !== null);
  check('CONSULTANT: sem botão Publicar', (await cons.$('[data-testid="publish-open"]')) === null);
  await cons.type('[data-testid="new-process-name"]', 'Processo do João');
  await cons.click('[data-testid="new-process-create"]');
  await cons.waitForFunction(() => /\/processes\/.+/.test(location.pathname), { timeout: 10000 });
  const fj = await editorFrame(cons);
  check('CONSULTANT: processo novo abre editável com o evento de início', (await fj.$('svg.canvas .node[data-kind="start"]')) !== null && (await fj.$('[data-testid="ro-badge"]')) === null);
  await cons.waitForSelector('[data-testid="process-list"] li');
  const delCons = await count(cons, '[data-action="delete-process"]');
  const ownedByJoao = (await api(cons, 'GET', `${P}/processes`)).data.processes.filter((p) => p.canDelete).length;
  check('CONSULTANT: só pode excluir os processos que criou', delCons === ownedByJoao && delCons >= 1, `${delCons}/${ownedByJoao}`);
  const joaoProc = (await api(cons, 'GET', `${P}/processes`)).data.processes.find((p) => p.name === 'Processo do João');
  const delOther = await api(cons, 'DELETE', `${P}/processes/${demo.id}`);
  check('CONSULTANT: excluir processo de outra pessoa via API => 403', delOther.status === 403, String(delOther.status));

  // ADMIN: vê excluir em todos e consegue apagar o do João pela UI
  const adm = await session('admin@ancoro.app');
  await adm.evaluate((id) => localStorage.setItem('ancoro_current_project_id', id), proj.id);
  await adm.goto(`${FRONT}/processes`, { waitUntil: 'networkidle0' });
  await adm.waitForSelector('[data-testid="process-list"] li');
  const total = await count(adm, '[data-testid="process-list"] li');
  check('ADMIN: pode excluir qualquer processo (botão em todos)', (await count(adm, '[data-action="delete-process"]')) === total, `${await count(adm, '[data-action="delete-process"]')}/${total}`);
  check('ADMIN: vê Publicar', (await adm.$('[data-testid="publish-open"]')) !== null);
  await adm.evaluate((name) => {
    const li = [...document.querySelectorAll('[data-testid="process-list"] li')].find((x) => x.textContent.includes(name));
    li.querySelector('[data-action="delete-process"]').click();
  }, 'Processo do João');
  await adm.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Excluir' && b.className.includes('bg-red')), { timeout: 5000 });
  await adm.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Excluir' && b.className.includes('bg-red')).click());
  await adm.waitForFunction((n) => document.querySelectorAll('[data-testid="process-list"] li').length === n - 1, { timeout: 8000 }, total);
  const gone = (await api(adm, 'GET', `${P}/processes`)).data.processes.every((p) => p.id !== joaoProc.id);
  check('ADMIN: excluir o processo do João pela UI funciona', gone);

  // isolamento entre projetos: processo de um projeto não abre pela URL de outro
  const other = (projects.data ?? projects).find((p) => p.id !== proj.id);
  const cross = await api(adm, 'GET', `/api/projects/${other.id}/processes/${demo.id}`);
  check('processo de outro projeto => 404 (sem vazamento entre projetos)', cross.status === 404, String(cross.status));

  // idioma EN: textos da página mudam sem recarregar o editor
  await adm.evaluate(() => { localStorage.setItem('ancoro_lang', 'en'); });
  await adm.reload({ waitUntil: 'networkidle0' });
  const enTitle = await adm.$eval('h1', (e) => e.textContent);
  check('i18n EN: título da página em inglês', enTitle === 'Processes', enTitle);
} catch (e) {
  console.log(`FAIL  exceção no cenário: ${e instanceof Error ? e.stack : e}`);
  failed++;
}

check('sem erros de página (pageerror)', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(failed ? `\n${failed} FALHA(S)` : '\nTODOS OS CHECKS PASSARAM');
process.exit(failed ? 1 : 0);
