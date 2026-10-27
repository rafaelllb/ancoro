/**
 * E2E do portal publicado em Chrome REAL, aberto por file:// (sem servidor, sem rede).
 * [2026-10-14] Criado: Fase 3 — navegação, deep link, busca, painel, tabelas, RACI, tema, idioma, mobile, página estática sem JS, XSS — Rafael Brito
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { importBizagi, parseModel, type ProcessModel } from '@ancoro/process-core';
import { loadViewerAssets, publish, writeFiles } from '../src/publish';

const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BPM = process.env.BIIN_BPM ?? 'C:/Users/rafae/OneDrive/Documentos/Profissional-Rafael/SAP/ISU/BIIN Process/Processo geral Billing - EN.bpm';
const HAS_CHROME = existsSync(CHROME);
mkdirSync('e2e/out', { recursive: true });

function fixture(): ProcessModel[] {
  const root = parseModel({
    id: 'Raiz', name: 'Processo raiz',
    nodes: [
      { id: 's', kind: 'start', name: 'Início', bounds: { x: 20, y: 40, w: 36, h: 36 } },
      { id: 'c', kind: 'subprocess', name: 'Chamar filho', calledProcessId: 'Filho', bounds: { x: 110, y: 18, w: 140, h: 80 } },
      { id: 'x', kind: 'task', name: '<img src=x onerror=window.__pwned=1>', bounds: { x: 300, y: 23, w: 120, h: 70 } },
      { id: 'e', kind: 'end', name: 'Fim', bounds: { x: 480, y: 40, w: 36, h: 36 } },
    ],
    flows: [{ id: 'f1', sourceId: 's', targetId: 'c' }, { id: 'f2', sourceId: 'c', targetId: 'x' }, { id: 'f3', sourceId: 'x', targetId: 'e' }],
  });
  const filho = parseModel({
    id: 'Filho', name: 'Processo filho', meta: { description: 'Faz coisas de faturamento', tags: ['isu'], version: '1.2', author: 'Rafael Brito' },
    attributeDefs: [
      { id: 'TC', name: 'TCodes', type: 'textarea' },
      { id: 'FA', name: 'Fiori_Apps', type: 'table', columns: [{ id: 'c1', name: 'App', type: 'text' }, { id: 'c2', name: 'Link', type: 'url' }] },
    ],
    lanes: [{ id: 'L1', name: 'Faturamento', bounds: { x: 36, y: 0, w: 420, h: 130 } }],
    pool: { x: 0, y: 0, w: 456, h: 130 },
    nodes: [
      { id: 'a', kind: 'task', variant: 'user', name: 'Criar fatura', laneId: 'L1', performer: 'Analista', accountable: 'Gerente', consulted: ['Fiscal'], informed: ['Cliente'], sla: '2 h', sapTransaction: 'EA00', requirementRefs: ['REQ-8'], systems: ['S/4HANA IS-U'], description: 'Cria a fatura do contrato.',
        attributes: [
          { name: 'TCodes', defId: 'TC', value: 'EA19 - Reverter fatura\nEAMABI - Faturamento em massa' },
          { name: 'Fiori_Apps', defId: 'FA', value: [['Resolve Implausible', "https://exemplo.sap/launchpad#/detail/Apps('F2185')/S32"], ['Process Missing', "https://exemplo.sap/launchpad#/detail/Apps('F3133')/S32"]] },
        ], bounds: { x: 120, y: 30, w: 120, h: 70 } },
      { id: 'b', kind: 'task', variant: 'service', name: 'Enviar fatura', laneId: 'L1', performer: 'Sistema', accountable: 'Gerente', bounds: { x: 300, y: 30, w: 120, h: 70 } },
    ],
    flows: [{ id: 'g1', sourceId: 'a', targetId: 'b', name: 'ok' }],
  });
  return [root, filho];
}

async function open(models: ProcessModel[], hash = '', viewport = { width: 1500, height: 900 }, extra: Partial<Parameters<typeof publish>[0]> = {}, waitFor: string | null = '.canvas svg') {
  const dir = mkdtempSync(join(tmpdir(), 'ps-portal-'));
  const res = await publish({ models, brand: { title: 'Portal E2E', accent: '#d94f00' }, viewer: loadViewerAssets(), ...extra });
  writeFiles(res.files, dir);
  const page = await browser.newPage();
  await page.setViewport(viewport);
  // todos os portais abertos por file:// compartilham o mesmo localStorage: cada teste começa limpo (uma vez por aba; recarregar preserva)
  await page.evaluateOnNewDocument(() => { if (!sessionStorage.getItem('__t')) { localStorage.clear(); sessionStorage.setItem('__t', '1'); } });
  const errors: string[] = [], requests: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', (r) => requests.push(r.url()));
  await page.goto(`${pathToFileURL(join(dir, 'index.html')).href}${hash}`, { waitUntil: 'networkidle0' });
  if (waitFor) await page.waitForSelector(waitFor);
  return { page, dir, errors, requests, res };
}

let browser: Browser;
beforeAll(async () => { if (HAS_CHROME) browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--allow-file-access-from-files'] }); });
afterAll(async () => { await browser?.close(); });

const settle = (ms = 150) => new Promise((r) => setTimeout(r, ms));
const hash = (p: Page) => p.evaluate(() => decodeURIComponent(location.hash));
const text = (p: Page, sel: string) => p.$eval(sel, (el) => (el as HTMLElement).innerText);

describe.skipIf(!HAS_CHROME)('portal publicado (file://, Chrome real)', () => {
  it('abre sem erros e SEM nenhuma requisição de rede (só file://)', async () => {
    const { page, errors, requests } = await open(fixture());
    expect(errors).toEqual([]);
    expect(requests.filter((u) => !u.startsWith('file:') && !u.startsWith('data:'))).toEqual([]);
    await page.close();
  });

  it('árvore pelos subprocessos, navegação, breadcrumbs e deep link por elemento (inclusive recarregando)', async () => {
    const { page, dir } = await open(fixture());
    expect(await page.$$eval('.tree a', (as) => as.map((a) => a.textContent))).toEqual(['Processo raiz', 'Processo filho']);
    expect(await hash(page)).toBe('#/p/Raiz');
    await page.click('.tree a[href="#/p/Filho"]');
    await settle(300);
    expect(await hash(page)).toBe('#/p/Filho');
    expect(await text(page, '.crumbs')).toMatch(/Processo raiz\s*›\s*Processo filho/);
    // clique no elemento => painel + hash com /e/
    await page.click('svg [data-id="a"] rect.shape');
    await settle(200);
    expect(await hash(page)).toBe('#/p/Filho/e/a');
    expect(await text(page, '.panel')).toContain('Criar fatura');
    expect(await page.$eval('svg [data-id="a"]', (g) => g.classList.contains('sel'))).toBe(true);
    // recarregar com o link direto restaura a seleção
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForSelector('.canvas svg');
    await settle(300);
    expect(await hash(page)).toBe('#/p/Filho/e/a');
    expect(await page.$eval('svg [data-id="a"]', (g) => g.classList.contains('sel'))).toBe(true);
    expect(await text(page, '.panel')).toContain('Analista');
    // voltar do navegador
    await page.goBack();
    await settle(300);
    expect(await hash(page)).not.toBe('#/p/Filho/e/a');
    void dir;
    await page.close();
  });

  it('painel mostra RACI, execução, sistemas, requisitos, TCodes (texto) e a tabela Fiori com links amigáveis (F2185…)', async () => {
    const { page } = await open(fixture(), '#/p/Filho/e/a');
    await settle(400);
    const panel = await text(page, '.panel');
    for (const s of ['Analista', 'Gerente', 'Fiscal', 'Cliente', '2 h', 'EA00', 'S/4HANA IS-U', 'REQ-8', 'EA19 - Reverter fatura', 'EAMABI - Faturamento em massa', 'Resolve Implausible']) expect(panel, s).toContain(s);
    const links = await page.$$eval('.panel .attr-table a', (as) => as.map((a) => [a.textContent, a.getAttribute('rel'), a.getAttribute('target')]));
    expect(links.map((l) => l[0])).toEqual(['F2185', 'F3133']);
    expect(links.every((l) => l[1]?.includes('noopener') && l[2] === '_blank')).toBe(true);
    // ligações: clicar em "Enviar fatura" (saída) seleciona o elemento
    await page.evaluate(() => [...document.querySelectorAll<HTMLAnchorElement>('.panel .nav a')].find((a) => a.textContent === 'Enviar fatura')!.click());
    await settle(300);
    expect(await hash(page)).toBe('#/p/Filho/e/b');
    await page.close();
  });

  it('duplo clique no subprocesso abre o processo chamado (drill-down)', async () => {
    const { page } = await open(fixture());
    const box = await (await page.$('svg [data-id="c"] rect.shape'))!.boundingBox();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2, { count: 2 });
    await settle(400);
    expect(await hash(page)).toBe('#/p/Filho');
    await page.close();
  });

  it('busca instantânea: por nome, transação SAP, texto de atributo (TCodes), apps Fiori e responsável; teclado e navegação', async () => {
    const { page } = await open(fixture());
    const search = async (q: string) => { await page.click('.search'); await page.$eval('.search', (el) => { (el as HTMLInputElement).value = ''; }); await page.type('.search', q); await settle(250); return page.$$eval('.results .hit', (h) => h.map((x) => (x as HTMLElement).innerText)); };
    expect((await search('criar fat')).join('|')).toContain('Criar fatura');         // prefixo + sem acento/caixa
    expect((await search('ea00')).join('|')).toContain('Criar fatura');               // transação SAP
    expect((await search('eamabi')).join('|')).toContain('Criar fatura');             // dentro do TCodes
    expect((await search('f2185')).join('|')).toContain('Criar fatura');              // app Fiori da tabela
    expect((await search('analista')).join('|')).toContain('Criar fatura');           // responsável
    expect((await search('zzzzzz')).join('|')).toBe('');
    await search('enviar');
    await page.keyboard.press('Enter');
    await settle(300);
    expect(await hash(page)).toBe('#/p/Filho/e/b');
    // atalho "/" foca a busca
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await page.keyboard.press('/');
    expect(await page.evaluate(() => document.activeElement?.classList.contains('search'))).toBe(true);
    await page.close();
  });

  it('aba Elementos (filtro por texto e tipo) e aba Responsáveis (matriz RACI)', async () => {
    const { page } = await open(fixture(), '#/p/Filho');
    await page.click('.tabs button:nth-child(2)');
    await settle(200);
    expect(await page.$$eval('[data-view="elements"] tbody tr', (r) => r.length)).toBe(2);
    await page.type('[data-view="elements"] input', 'enviar');
    expect(await page.$$eval('[data-view="elements"] tbody tr', (r) => r.length)).toBe(1);
    await page.click('[data-view="elements"] tbody tr');
    await settle(300);
    expect(await hash(page)).toBe('#/p/Filho/e/b');
    await page.click('.tabs button:nth-child(3)');
    await settle(200);
    const raci = await page.$$eval('[data-view="people"] .raci tbody tr', (rows) => rows.map((r) => (r as HTMLElement).innerText.replace(/\s+/g, ' ').trim()));
    expect(raci.some((r) => r.startsWith('Criar fatura') && /R/.test(r) && /A/.test(r) && /C/.test(r) && /I/.test(r))).toBe(true);
    await page.close();
  });

  it('tema (claro/escuro/auto), idioma PT/EN e preferências persistidas', async () => {
    const { page } = await open(fixture());
    expect(await page.$eval('html', (h) => h.getAttribute('data-theme'))).toBeNull();
    await page.click('[aria-label="Tema"]'); // auto -> claro
    await page.click('[aria-label="Tema"]'); // claro -> escuro
    expect(await page.$eval('html', (h) => h.getAttribute('data-theme'))).toBe('dark');
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).not.toBe('rgb(246, 247, 249)');
    expect(await text(page, '.tabs')).toContain('Diagrama');
    await page.click('[aria-label="Idioma"]');
    await settle(400);
    expect(await text(page, '.tabs')).toContain('Diagram');
    expect(await text(page, '.tabs')).toContain('People');
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForSelector('.canvas svg');
    expect(await page.$eval('html', (h) => h.getAttribute('data-theme'))).toBe('dark'); // persistido
    expect(await text(page, '.tabs')).toContain('People');
    await page.close();
  });

  it('marca por configuração: a cor de destaque do brand.json chega ao CSS final', async () => {
    const { page } = await open(fixture());
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim())).toBe('#d94f00');
    expect(await page.title()).toContain('Portal E2E');
    await page.close();
  });

  it('logo da marca (otimizado) aparece no cabeçalho e na página estática', async () => {
    const { default: sharp } = await import('sharp');
    const dir = mkdtempSync(join(tmpdir(), 'ps-logo-e2e-'));
    const { writeFileSync } = await import('node:fs');
    writeFileSync(join(dir, 'logo.png'), await sharp({ create: { width: 800, height: 200, channels: 3, background: '#d94f00' } }).png().toBuffer());
    const { page, dir: out } = await open(fixture(), '', { width: 1500, height: 900 }, { brand: { title: 'Com logo', logo: 'logo.png' }, brandDir: dir });
    expect(await page.$eval('.top img.logo', (i) => (i as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    const p2 = await browser.newPage();
    await p2.goto(pathToFileURL(join(out, 'p/Filho.html')).href, { waitUntil: 'load' });
    expect(await p2.$eval('.top img.logo', (i) => (i as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await p2.close();
    await page.close();
  });

  it('celular: a busca ocupa a largura toda (não fica minúscula)', async () => {
    const { page } = await open(fixture(), '', { width: 390, height: 800 });
    expect(await page.$eval('.search', (e) => e.getBoundingClientRect().width)).toBeGreaterThan(300);
    await page.close();
  });

  it('versão estática (p/<id>.html) funciona com JavaScript DESLIGADO: SVG, tabela e atributos', async () => {
    const { page, dir } = await open(fixture());
    const p2 = await browser.newPage();
    await p2.setJavaScriptEnabled(false);
    await p2.goto(pathToFileURL(join(dir, 'p/Filho.html')).href, { waitUntil: 'load' });
    expect(await p2.$$eval('svg [data-id]', (n) => n.length)).toBeGreaterThan(3);
    expect(await p2.$eval('body', (b) => (b as HTMLElement).innerText)).toContain('EA19 - Reverter fatura');
    expect(await p2.$$eval('table.grid tbody tr', (r) => r.length)).toBe(2);
    await p2.close();
    await page.close();
  });

  it('SEGURANÇA: nome de elemento com HTML não vira elemento nem executa script', async () => {
    const { page } = await open(fixture(), '#/p/Raiz/e/x');
    await settle(300);
    expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
    expect(await page.$$eval('img[src="x"]', (i) => i.length)).toBe(0);
    expect(await text(page, '.panel')).toContain('<img src=x onerror=window.__pwned=1>'); // aparece como TEXTO
    await page.close();
  });

  it('celular (390px): navegação e detalhes viram gavetas; zoom por botões', async () => {
    const { page } = await open(fixture(), '#/p/Filho/e/a', { width: 390, height: 800 });
    await settle(300);
    expect(await page.$eval('.tree', (t) => t.getBoundingClientRect().right)).toBeLessThanOrEqual(0); // fechada
    await page.click('.top > .icon:first-child');
    await settle(300);
    expect(await page.$eval('.tree', (t) => t.getBoundingClientRect().left)).toBeGreaterThanOrEqual(0);
    await page.click('.tree a[href="#/p/Raiz"]');
    await settle(300);
    expect(await page.$eval('.tree', (t) => t.getBoundingClientRect().right)).toBeLessThanOrEqual(0); // fecha ao navegar
    const k0 = await page.$eval('.canvas', (c) => (c as HTMLElement).style.transform);
    await page.click('.zoom button:nth-child(1)');
    expect(await page.$eval('.canvas', (c) => (c as HTMLElement).style.transform)).not.toBe(k0);
    await page.close();
  });
});

describe.skipIf(!HAS_CHROME)('portal protegido por senha e novidades (file://, Chrome real)', () => {
  const PW = 'frase longa de teste';
  const protectedOpts = { password: PW, kdfIterations: 1000 };

  it('pede a senha; errada é recusada; certa abre tudo (árvore, busca, deep link); recarregar na mesma aba não pede de novo', async () => {
    const { page, errors } = await open(fixture(), '#/p/Filho/e/a', { width: 1500, height: 900 }, protectedOpts, '.lock');
    expect(await page.$$eval('.tree', (n) => n.length)).toBe(0); // nada do portal renderizado antes da senha
    expect(await page.evaluate(() => document.body.innerText)).not.toMatch(/Criar fatura|Processo filho/);
    await page.type('.lock input', 'senha errada qualquer');
    await page.click('.lock button');
    await page.waitForFunction(() => document.querySelector('.lock-err')?.textContent);
    expect(await text(page, '.lock-err')).toMatch(/incorreta/i);
    await page.$eval('.lock input', (i) => { (i as HTMLInputElement).value = ''; });
    await page.type('.lock input', PW);
    await page.click('.lock button');
    await page.waitForSelector('.canvas svg');
    await settle(400);
    expect(await hash(page)).toBe('#/p/Filho/e/a');            // deep link sobrevive ao desbloqueio
    expect(await text(page, '.panel')).toContain('Criar fatura');
    expect(await page.$$eval('.tree a', (a) => a.length)).toBe(2);
    await page.click('.search');
    await page.type('.search', 'eamabi');
    await settle(300);
    expect(await page.$$eval('.results .hit', (h) => h.length)).toBeGreaterThan(0); // busca decifrada funciona
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForSelector('.canvas svg', { timeout: 8000 }); // sessionStorage: não pede de novo
    expect(errors).toEqual([]);
    await page.close();
  });

  it('"Novidades": a 2ª publicação mostra o botão e o diff (alterado/adicionado) com links para os elementos', async () => {
    const a = await publish({ models: fixture(), brand: { title: 'Portal E2E' }, viewer: loadViewerAssets() });
    const prev = JSON.parse(readFileSync(join(mkdtempSyncWith(a.files), 'versions.json'), 'utf8'));
    const next = fixture().map((m) => (m.id === 'Filho' ? { ...m, nodes: m.nodes.map((n) => (n.id === 'a' ? { ...n, name: 'Criar fatura mensal', sla: '4 h' } : n)) } : m));
    const { page } = await open(next, '', { width: 1500, height: 900 }, { previousVersions: prev, versionLabel: 'Release 2' });
    expect(await page.$('.news')).not.toBeNull();
    await page.click('.news');
    await settle(500);
    expect(await hash(page)).toBe('#/changes');
    const body = await text(page, '[data-view="changes"]');
    expect(body).toContain('Versão 2');
    expect(body).toContain('Release 2');
    expect(body).toContain('Criar fatura mensal');
    expect(body).toMatch(/nome, SLA|SLA, nome/);
    await page.click('[data-view="changes"] a[href*="/e/a"]');
    await settle(400);
    expect(await hash(page)).toBe('#/p/Filho/e/a');
    await page.close();
  });
});

function mkdtempSyncWith(files: Map<string, string | Uint8Array>): string {
  const dir = mkdtempSync(join(tmpdir(), 'ps-prev-'));
  writeFiles(files, dir);
  return dir;
}

describe.skipIf(!HAS_CHROME || !existsSync(BPM))('portal do corpus real (BIIN)', () => {
  it('publica os 7 diagramas; árvore com hierarquia; atributos reais (TCodes, Fiori) visíveis; busca por F2185', async () => {
    const models = importBizagi(new Uint8Array(readFileSync(BPM))).processes;
    const { page, errors } = await open(models);
    expect(errors).toEqual([]);
    expect(await page.$$eval('.tree a', (as) => as.length)).toBe(7);
    expect(await page.$eval('.tree > ul > li > a', (a) => a.textContent)).toBeTruthy();
    // vai ao processo S4HANA e seleciona o subprocesso "Meter Reading"
    await page.evaluate(() => { location.hash = '#/p/' + encodeURIComponent([...document.querySelectorAll<HTMLAnchorElement>('.tree a')].find((a) => a.textContent === 'SAP S/4HANA Utilities Process')!.getAttribute('href')!.split('/p/')[1]!); });
    await settle(500);
    await page.evaluate(() => {
      const info = [...document.querySelectorAll('svg [data-kind="subprocess"]')].find((g) => g.textContent?.includes('Meter'));
      location.hash = `${location.hash.split('?')[0]}/e/${encodeURIComponent(info!.getAttribute('data-id')!)}`;
    });
    await settle(500);
    const panel = await text(page, '.panel');
    expect(panel).toContain('EL01 - Individual Reading Order Creation');
    const apps = await page.$$eval('.panel .attr-table a', (as) => as.map((a) => a.textContent));
    expect(apps).toEqual(['F2786', 'F3133', 'F2185']);
    await page.screenshot({ path: 'e2e/out/portal-corpus.png' });
    await page.click('.search');
    await page.type('.search', 'F2185');
    await settle(300);
    expect((await page.$$eval('.results .hit', (h) => h.length))).toBeGreaterThan(0);
    await page.close();
  });
});
