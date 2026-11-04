/**
 * E2E dos anexos por elemento (Process Studio dentro do Ancoro) num Chrome real: backend + frontend + editor embutido.
 *
 * [2026-10-30] Criado: anexar/ver/baixar/excluir arquivos e imagens em elementos BPMN; leitura para CLIENT; recusa de arquivo falso — Rafael Brito
 *
 * Pré-requisitos idênticos a ancoro-fullstack.mjs (scripts/e2e/process-studio-env.sh up + build:process-studio).
 * Uso: node e2e/ancoro-attachments.mjs      Env: FRONT, API, CHROME
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FRONT = process.env.FRONT ?? 'http://localhost:5199';
const API = process.env.API ?? 'http://localhost:3100';
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PASSWORD = 'demo123';
mkdirSync('e2e/out', { recursive: true });

// PNG 1x1 válido, PDF mínimo e um "PNG" falso (texto) para provar a recusa pela assinatura
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const files = {
  png: resolve('e2e/out/tela-teste.png'), pdf: resolve('e2e/out/norma-teste.pdf'), fake: resolve('e2e/out/falso.png'),
};
writeFileSync(files.png, PNG);
writeFileSync(files.pdf, '%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
writeFileSync(files.fake, 'isto nao e uma imagem');

let failed = 0;
const check = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ' + extra}`); if (!cond) failed++; };
const settle = (ms = 150) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await settle(100); } return false; };

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1600, height: 950 } });
const errors = [];

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
const api = (page, method, path) => page.evaluate(async (API, method, path) => {
  const r = await fetch(API + path, { method, headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
  return { status: r.status, data: (r.headers.get('content-type') ?? '').includes('json') ? await r.json() : null };
}, API, method, path);

async function openFirstProcess(page, projectId) {
  await page.evaluate((id) => localStorage.setItem('ancoro_current_project_id', id), projectId);
  await page.goto(`${FRONT}/processes`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-testid="process-list"] li', { timeout: 15000 });
  const procId = await page.evaluate(() => {
    const li = document.querySelector('[data-testid="process-list"] li');
    li.querySelector('[data-action="open-process"]').click();
    return null;
  });
  void procId;
  await page.waitForSelector('iframe[data-testid="process-editor"]', { timeout: 15000 });
  const frame = await (await page.$('iframe[data-testid="process-editor"]')).contentFrame();
  await frame.waitForSelector('[data-id]', { timeout: 20000 });
  await settle(300);
  return frame;
}
async function selectFirstTask(frame) {
  const el = await frame.$('svg.canvas .node[data-kind="task"] rect.shape');
  const b = await el.boundingBox();
  await frame.page().mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await settle(300);
  return frame.$eval('svg.canvas .node[data-kind="task"]', (n) => n.getAttribute('data-id'));
}
const items = (frame) => frame.$$eval('.files .file strong', (els) => els.map((e) => e.textContent));

try {
  console.log('--- MANAGER: anexar, visualizar, baixar, excluir');
  const mgr = await session('rafael.brito@ancoro.com');
  const projects = (await api(mgr, 'GET', '/api/projects')).data;
  const proj = (projects.data ?? projects).find((p) => p.name.includes('S/4 HANA')) ?? (projects.data ?? projects)[0];
  const frame = await openFirstProcess(mgr, proj.id);
  const elementId = await selectFirstTask(frame);
  check('aba Anexos existe no painel do elemento', !!(await frame.$('[data-tab="files"]')));
  await frame.click('[data-tab="files"]');
  await frame.waitForSelector('.files .drop', { timeout: 8000 });
  check('vazio: mostra a mensagem de sem anexos', await until(async () => (await frame.$('.files .filelist li')) === null && (await frame.$eval('.files', (e) => e.textContent)).length > 0));

  const input = await frame.$('.files input[type="file"]');
  await input.uploadFile(files.png, files.pdf);
  check('2 arquivos aparecem na lista após o upload', await until(async () => (await items(frame)).length === 2), JSON.stringify(await items(frame)));
  check('nomes preservados', (await items(frame)).sort().join('|') === 'norma-teste.pdf|tela-teste.png', JSON.stringify(await items(frame)));
  check('imagem ganha miniatura (blob URL gerada no editor)', await until(async () => frame.$eval('.files .file img', (i) => i.src.startsWith('blob:')).catch(() => false)));
  check('PDF mostra selo PDF (sem miniatura)', await frame.$eval('.files .thumb.ph', (e) => e.textContent === 'PDF').catch(() => false));

  const server = (await api(mgr, 'GET', `/api/projects/${proj.id}/processes`)).data.processes[0];
  const list = (await api(mgr, 'GET', `/api/projects/${proj.id}/processes/${server.id}/attachments?elementId=${elementId}`)).data;
  check('servidor registra os 2 anexos no elemento certo', list.attachments.length === 2 && list.attachments.every((a) => a.elementId === elementId));
  check('tipo detectado pelo servidor (png + pdf)', list.attachments.map((a) => a.mimeType).sort().join() === 'application/pdf,image/png');

  await frame.click('.files .zoom, .files .thumb:not(.ph)').catch(() => undefined);
  check('clicar na miniatura abre o visualizador', await until(async () => !!(await frame.$('.lightbox img'))));
  await frame.click('.lightbox');
  check('clicar fora fecha o visualizador', await until(async () => !(await frame.$('.lightbox'))));

  const dlButtons = await frame.$$('.files .file .acts button:not(.danger)');
  await dlButtons[0].click();
  await settle(1200);
  check('baixar não gera erro', !(await frame.$('.files .ferr')));

  await input.uploadFile(files.fake);
  check('arquivo falso (texto como .png) é recusado com mensagem', await until(async () => !!(await frame.$('.files .ferr'))));
  check('...e não entra na lista', (await items(frame)).length === 2);

  // persistência: recarrega tudo e reabre
  await mgr.reload({ waitUntil: 'networkidle0' });
  const frame2 = await openFirstProcess(mgr, proj.id);
  await selectFirstTask(frame2);
  await frame2.click('[data-tab="files"]');
  check('anexos persistem após recarregar a página', await until(async () => (await items(frame2)).length === 2));

  // exclusão (o confirm é aceito automaticamente)
  await frame2.click('.files .file .acts button.danger');
  check('excluir remove da lista', await until(async () => (await items(frame2)).length === 1));
  const after = (await api(mgr, 'GET', `/api/projects/${proj.id}/processes/${server.id}/attachments`)).data;
  check('...e do servidor', after.attachments.length === 1);

  console.log('--- CLIENT: lê e baixa, não altera');
  const cli = await session('ana.costa@cliente.com');
  const frame3 = await openFirstProcess(cli, proj.id);
  await selectFirstTask(frame3);
  const tabBtn = await frame3.$('[data-tab="files"]');
  check('CLIENT vê a aba Anexos e ela está habilitada', !!tabBtn && !(await tabBtn.evaluate((b) => b.disabled)));
  await tabBtn.click();
  check('CLIENT vê o anexo existente', await until(async () => (await items(frame3)).length === 1));
  check('CLIENT: sem área de envio nem Excluir', !(await frame3.$('.files .drop')) && !(await frame3.$('.files .acts button.danger')));
  check('CLIENT: Baixar habilitado', await frame3.$eval('.files .file .acts button', (b) => !b.disabled));
  const denied = await cli.evaluate(async (API, pid, proj, el) => {
    const r = await fetch(`${API}/api/projects/${proj}/processes/${pid}/attachments?elementId=${el}&name=x.png`, {
      method: 'POST', headers: { 'Content-Type': 'application/octet-stream', Authorization: `Bearer ${localStorage.getItem('token')}` }, body: new Uint8Array([1, 2, 3]),
    });
    return r.status;
  }, API, server.id, proj.id, elementId);
  check('CLIENT: servidor recusa upload (403)', denied === 403, String(denied));

  check('sem erros de página (pageerror)', errors.length === 0, errors.join('\n'));
} catch (e) {
  console.log('ERRO NO CENÁRIO:', e);
  failed++;
} finally {
  await browser.close();
}
console.log(failed ? `\n${failed} CHECK(S) FALHARAM` : '\nTODOS OS CHECKS PASSARAM');
process.exit(failed ? 1 : 0);
