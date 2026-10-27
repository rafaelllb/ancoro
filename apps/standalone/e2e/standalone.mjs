/**
 * E2E do Process Studio STANDALONE (Fase 6) num Chrome real — sem Ancoro, sem backend dele.
 * Sobe o servidor (dist/server.mjs) com dados descartáveis, lê o código de login do "e-mail" (console) e dirige a UI.
 *
 * Pré-requisito: `npm run build` (kit + editor + servidor).  Uso: node e2e/standalone.mjs   Env: CHROME, PS_E2E_PORT
 *
 * [2026-10-16] Criado: Fase 6 — login por código e por link, editor embutido via ponte, salvar/versões/papéis/publicar — Rafael Brito
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const PORT = Number(process.env.PS_E2E_PORT ?? 3290);
const BASE = `http://localhost:${PORT}`;
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const dataDir = mkdtempSync(join(tmpdir(), 'ps-e2e-'));
mkdirSync('e2e/out', { recursive: true });

let failed = 0;
const check = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ' + extra}`); if (!cond) failed++; };
const settle = (ms = 150) => new Promise((r) => setTimeout(r, ms));

// ---- servidor
let log = '';
const server = spawn(process.execPath, ['dist/server.mjs'], {
  env: { ...process.env, PS_PORT: String(PORT), PS_BASE_URL: BASE, PS_DATA_DIR: dataDir, PS_ADMIN_EMAIL: 'admin@e2e.io', NODE_ENV: 'development' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', (d) => { log += d; });
server.stderr.on('data', (d) => { log += d; });
for (let i = 0; i < 40 && !(await fetch(`${BASE}/api/health`).then((r) => r.ok, () => false)); i++) await settle(250);

/** Espera o próximo e-mail para `to` e devolve { code, link } */
async function nextMail(to, since) {
  for (let i = 0; i < 40; i++) {
    const re = new RegExp(`\\[mail\\] para ${to.replace('.', '\\.')}\\s+\\[mail\\] código: (\\d{6})\\s+\\[mail\\] link:\\s+(\\S+)`, 'g');
    const all = [...log.matchAll(re)];
    if (all.length > since) { const m = all[all.length - 1]; return { code: m[1], link: m[2], n: all.length }; }
    await settle(150);
  }
  throw new Error(`e-mail para ${to} não chegou`);
}
const mailCount = (to) => [...log.matchAll(new RegExp(`\\[mail\\] para ${to.replace('.', '\\.')}`, 'g'))].length;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1500, height: 900 } });
const problems = [];

async function newPage() {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`pageerror: ${e}`));
  // 401/403 no console são esperados (ex.: /api/me antes do login); o que não pode aparecer é violação de CSP ou erro de script
  page.on('console', (m) => { if (m.type() === 'error' && !/status of 40[13]/.test(m.text())) problems.push(`console: ${m.text()}`); });
  page.on('dialog', (d) => d.accept());
  return page;
}
const api = (page, method, path, body) => page.evaluate(async (method, path, body) => {
  const r = await fetch(path, { method, headers: { 'x-ps-csrf': '1', ...(body && { 'content-type': 'application/json' }) }, body: body ? JSON.stringify(body) : undefined });
  const ct = r.headers.get('content-type') ?? '';
  const data = ct.includes('json') ? await r.json() : ct.includes('zip') ? Array.from(new Uint8Array(await r.arrayBuffer()).slice(0, 2)) : await r.text();
  return { status: r.status, data };
}, method, path, body);

async function loginByCode(page, email) {
  const before = mailCount(email);
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.waitForSelector('input[type="email"]');
  await page.type('input[type="email"]', email);
  await page.click('button[type="submit"]');
  const mail = await nextMail(email, before);
  await page.waitForSelector('input.code', { visible: true });
  await page.type('input.code', mail.code);
  await page.evaluate(() => document.querySelectorAll('form')[1].requestSubmit());
  await page.waitForSelector('.toolbar h2', { timeout: 10000 });
}
const editorFrame = async (page) => {
  await page.waitForSelector('iframe.editor-frame:not(.hidden)', { timeout: 20000 });
  const frame = await (await page.$('iframe.editor-frame')).contentFrame();
  await frame.waitForSelector('[data-id]', { timeout: 20000 });
  await settle(300);
  return frame;
};

try {
  // =================================================================== ADMIN: login por código
  console.log('--- ADMIN: login por código');
  const admin = await newPage();
  await admin.goto(BASE, { waitUntil: 'networkidle0' });
  check('sem sessão => redireciona para a tela de login', admin.url().includes('#/entrar'));
  await loginByCode(admin, 'admin@e2e.io');
  check('após o código entra na lista de processos', (await admin.$eval('.toolbar h2', (e) => e.textContent)) === 'Processos');
  await admin.reload({ waitUntil: 'networkidle0' });
  check('recarregar mantém a sessão (cookie HttpOnly)', (await admin.$('.toolbar h2')) !== null);
  check('cookie de sessão é HttpOnly e SameSite=Strict', await admin.cookies().then((c) => { const s = c.find((x) => x.name === 'ps_session'); return !!s && s.httpOnly && s.sameSite === 'Strict'; }));
  check('JS da página não enxerga o cookie', !(await admin.evaluate(() => document.cookie.includes('ps_session'))));
  await admin.screenshot({ path: 'e2e/out/f6-01-lista.png' });

  // =================================================================== criar + editar + salvar
  console.log('--- ADMIN: criar, editar no editor embutido, salvar, versões');
  await admin.click('.toolbar .primary');
  await admin.waitForSelector('dialog input');
  await admin.type('dialog input', 'Ciclo de faturamento');
  await admin.evaluate(() => document.querySelector('dialog form').requestSubmit());
  const frame = await editorFrame(admin);
  check('abriu o editor embutido (#/p/<id>) e o diagrama foi desenhado pela ponte', admin.url().includes('#/p/') && (await frame.$$('svg.canvas .node')).length >= 1);
  check('modo host: sem botões locais de arquivo', (await frame.$('[data-action="new"]')) === null);
  check('botão Salvar começa desabilitado', await frame.$eval('[data-action="host-save"]', (b) => b.disabled));
  await admin.screenshot({ path: 'e2e/out/f6-02-editor.png' });

  // vincula uma referência livre (não existe catálogo: o texto digitado vira "(novo)") ao evento de início
  const node = await frame.$('svg.canvas .node');
  const b = await node.boundingBox();
  await admin.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await settle(250);
  await frame.click('[data-tab="links"]');
  await settle(100);
  await frame.click('[data-testid="req-search"]');
  await frame.type('[data-testid="req-search"]', 'RF-042');
  await frame.waitForSelector('[data-req="RF-042"]', { timeout: 8000 });
  await frame.click('[data-req="RF-042"]');
  await settle(200);
  check('referência livre aparece como chip', (await frame.$$eval('.req-picker .tag', (t) => t.map((x) => x.textContent))).some((x) => x.includes('RF-042')));
  check('badge de alterações não salvas aparece', (await frame.$('[data-testid="dirty-badge"]')) !== null);
  await frame.click('[data-action="host-save"]');
  await frame.waitForFunction(() => !document.querySelector('[data-testid="dirty-badge"]'), { timeout: 8000 });
  check('salvar limpa o badge e a revisão sobe (r2)', (await frame.$eval('header .muted', (e) => e.textContent)) === 'r2');
  const pid = admin.url().split('#/p/')[1];
  const saved = (await api(admin, 'GET', `/api/processes/${pid}`)).data;
  check('o servidor gravou o vínculo no modelo', saved.model.nodes.some((n) => n.requirementRefs.includes('RF-042')) && saved.rev === 2);
  const where = (await api(admin, 'GET', '/api/processes/by-reference/RF-042')).data.links;
  check('"onde esta referência aparece?" encontra o processo', where.length === 1 && where[0].processId === pid);

  await frame.click('[data-action="host-versions"]');
  await frame.waitForSelector('[data-testid="versions-dialog"]');
  await frame.type('.modal .row input', 'primeira');
  await frame.click('[data-action="version-snapshot"]');
  await frame.waitForSelector('ul.versions li', { timeout: 8000 });
  check('snapshot rotulado aparece no histórico', (await frame.$eval('ul.versions li', (e) => e.textContent)).includes('primeira'));

  // =================================================================== convite + login por LINK + papel VIEWER
  console.log('--- ADMIN convida; leitor entra pelo LINK');
  check('ADMIN convida um leitor', (await api(admin, 'POST', '/api/users', { email: 'leitor@e2e.io', role: 'VIEWER' })).status === 201);
  const viewer = await newPage();
  await viewer.goto(BASE, { waitUntil: 'networkidle0' });
  await viewer.type('input[type="email"]', 'leitor@e2e.io');
  await viewer.click('button[type="submit"]');
  const mail = await nextMail('leitor@e2e.io', 0);
  const mailsBeforeOpen = mailCount('leitor@e2e.io');
  await viewer.goto(mail.link, { waitUntil: 'networkidle0' });
  check('abrir o link NÃO loga sozinho (pede confirmação)', (await viewer.$('.toolbar h2')) === null && (await viewer.$('.login button.primary')) !== null);
  await viewer.click('.login button.primary');
  await viewer.waitForSelector('.toolbar h2', { timeout: 10000 });
  check('após confirmar o link o leitor está logado como VIEWER', (await api(viewer, 'GET', '/api/me')).data.user.role === 'VIEWER' && mailCount('leitor@e2e.io') === mailsBeforeOpen);
  check('leitor não vê "Novo processo", "Importar" nem "Publicar"', (await viewer.$$('.toolbar button')).length === 0);
  check('leitor não vê o menu Usuários', (await viewer.$$eval('header a', (a) => a.map((x) => x.textContent))).every((x) => x !== 'Usuários'));
  await viewer.goto(`${BASE}/#/p/${pid}`, { waitUntil: 'networkidle0' });
  const vf = await editorFrame(viewer);
  check('editor do leitor: selo somente leitura e sem Salvar', (await vf.$('[data-testid="ro-badge"]')) !== null && (await vf.$('[data-action="host-save"]')) === null);
  check('API recusa escrita do leitor (403)', (await api(viewer, 'PUT', `/api/processes/${pid}`, { baseRev: 2, model: saved.model })).status === 403);
  check('API recusa lista de usuários ao leitor (403)', (await api(viewer, 'GET', '/api/users')).status === 403);

  // =================================================================== publicar, CSRF, logout
  console.log('--- publicar, CSRF e logout');
  const pub = await api(admin, 'POST', '/api/processes/publish', { label: 'R1' });
  check('publicar devolve um ZIP', pub.status === 200 && pub.data[0] === 0x50 && pub.data[1] === 0x4b);
  const csrf = await admin.evaluate(async () => (await fetch('/api/processes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"name":"x"}' })).status);
  check('POST sem cabeçalho anti-CSRF => 403 mesmo com cookie válido', csrf === 403);
  await admin.goto(`${BASE}/#/`, { waitUntil: 'networkidle0' });
  await admin.evaluate(() => [...document.querySelectorAll('header button')].find((b) => b.textContent === 'Sair').click());
  await admin.waitForFunction(() => location.hash.startsWith('#/entrar'), { timeout: 8000 });
  check('sair leva ao login e invalida o cookie', (await api(admin, 'GET', '/api/me')).status === 401);

  check('nenhum erro de página/console (inclui violações de CSP)', problems.length === 0, problems.slice(0, 3).join(' | '));
} catch (e) {
  failed++;
  console.log('FAIL  exceção:', e);
} finally {
  await browser.close();
  server.kill();
  await settle(300);
  try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* arquivo ainda preso no Windows: tmp limpa depois */ }
}
console.log(failed ? `\n${failed} FALHA(S)` : '\nTODOS OS CHECKS PASSARAM');
process.exit(failed ? 1 : 0);
