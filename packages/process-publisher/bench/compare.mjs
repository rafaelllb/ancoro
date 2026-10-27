/**
 * Compara o portal do Bizagi (export de referência) com o portal publicado pelo Process Studio, MEDINDO uma jornada idêntica:
 *   (A) abrir o portal (cache frio)  ->  (B) abrir o diagrama "Invoicing Process"  ->  (C) clicar num elemento  ->  (D) celular 390px.
 * Mede: tamanho em disco, requisições e bytes (bruto e gzip) até o diagrama aberto, tempos (mediana de N execuções), erros, busca,
 * se a URL muda ao abrir o diagrama e ao selecionar um elemento (link direto) e overflow horizontal no celular.
 *
 * [2026-10-14] Criado: Fase 3 / passo 7 — evidência para a tabela do README §6.3 — Rafael Brito
 * [2026-10-14] Alterado: jornada em vez de "carga inicial": o Bizagi abre numa LISTA e só desenha o diagrama depois do clique; o diagrama dele é um
 *   <img> do SVG sobre canvas (Kinetic) com "hotspots" HTML por elemento — descoberto com bench/probe.mjs; a 1ª versão deste script comparava
 *   coisas diferentes (e o seletor do Bizagi nunca casava) — Rafael Brito
 * Uso: node bench/compare.mjs "<pasta do export Bizagi>" "<pasta do portal publicado>" [--runs 7]
 * Os dois são servidos por HTTP local, sem throttling: mede custo de bytes/parse/render, não a latência da internet.
 */
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { gzipSync } from 'node:zlib';
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const [bizagiDir, ourDir] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const runs = Number(process.argv.includes('--runs') ? process.argv[process.argv.indexOf('--runs') + 1] : 7);
if (!bizagiDir || !ourDir) { console.error('uso: node bench/compare.mjs "<export Bizagi>" "<portal publicado>" [--runs 7]'); process.exit(1); }

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff': 'font/woff', '.ttf': 'font/ttf', '.gif': 'image/gif' };
function serve(root) {
  return new Promise((resolve) => {
    const srv = createServer((req, res) => {
      const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
      const f = normalize(join(root, path === '/' ? 'index.html' : path));
      if (!f.startsWith(normalize(root)) || !existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': MIME[extname(f).toLowerCase()] ?? 'application/octet-stream', 'cache-control': 'no-store' });
      createReadStream(f).pipe(res);
    }).listen(0, '127.0.0.1', () => resolve({ srv, url: `http://127.0.0.1:${srv.address().port}/` }));
  });
}

/** tamanho do portal em disco (ignora lixo local que não faz parte do site: nul, .claude, ideias/, *.ps1/.bat de rebrand) */
function diskStats(dir) {
  let files = 0, bytes = 0;
  const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) {
    if (['nul', '.claude', 'ideias'].includes(e.name) || /\.(ps1|bat|md)$/i.test(e.name)) continue;
    const p = join(d, e.name);
    if (e.isDirectory()) walk(p); else { files++; bytes += statSync(p).size; }
  } };
  walk(dir);
  return { files, bytes };
}

const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

/** site: { openProcess(page): clica no processo; ready: seletor do diagrama pronto; element: seletor clicável de um elemento } */
async function measure(browser, base, site) {
  const loadT = [], openT = [];
  let sample;
  for (let i = 0; i < runs; i++) {
    const page = await browser.newPage();
    await page.setCacheEnabled(false);
    // requisições EXTERNAS (ex.: Google Analytics do analytics.js do Rafael) são bloqueadas e contadas à parte: dependem da internet do momento
    // e travavam o evento load (timeout de 30 s) — o que também é um achado: o portal do Bizagi + analytics.js não carrega sem rede.
    const external = [];
    await page.setRequestInterception(true);
    page.on('request', (r) => { if (/^https?:\/\/(127\.0\.0\.1|localhost)/.test(r.url()) || r.url().startsWith('data:')) r.continue(); else { external.push(new URL(r.url()).host); r.abort(); } });
    const errors = [], res = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 100)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 100)); });
    page.on('response', async (r) => { try { const b = await r.buffer(); res.push({ url: r.url(), type: r.headers()['content-type'] ?? '', raw: b.length, gz: gzipSync(b).length, status: r.status() }); } catch { /* sem corpo */ } });

    const t0 = Date.now();
    await page.goto(base, { waitUntil: 'load' });
    loadT.push(Date.now() - t0);
    const bytesAtLoad = res.reduce((a, x) => a + x.raw, 0);
    await new Promise((r) => setTimeout(r, 600)); // deixa requisições pós-load (miniaturas etc.) terminarem: contam como parte da carga

    const hash0 = await page.evaluate(() => location.href);
    const t1 = Date.now();
    const opened = await page.evaluate(site.openProcess);
    await page.waitForFunction(site.ready, { timeout: 30000 }).catch(() => {});
    openT.push(Date.now() - t1);
    await new Promise((r) => setTimeout(r, 300));

    if (i === runs - 1) {
      const sum = (f, k = 'raw') => res.filter(f).reduce((a, x) => a + x[k], 0);
      const hashAfterOpen = await page.evaluate(() => location.href);
      sample = {
        opened, requests: res.length, rawBytes: sum(() => true), gzBytes: sum(() => true, 'gz'), rawAtLoad: bytesAtLoad,
        jsRaw: sum((x) => /javascript/.test(x.type)), jsGz: sum((x) => /javascript/.test(x.type), 'gz'),
        external: [...new Set(external)].length ? [...new Set(external)].join(', ') : 'nenhuma', errors: errors.filter((e) => !/ERR_FAILED|Failed to load resource/.test(e)).length, errorSample: errors[0] ?? '', failed: res.filter((x) => x.status >= 400).length,
        diagramReady: await page.evaluate(site.ready),
        search: await page.evaluate(() => document.querySelectorAll('input[type=search], input[class*="search" i], input[placeholder*="earch" i], input[placeholder*="usc" i]').length),
        urlOnOpen: hashAfterOpen !== hash0,
      };
      // selecionar um elemento com o mouse (clique real)
      const before = await page.evaluate(() => location.href);
      const bodyBefore = await page.evaluate(() => document.body.innerText.length);
      const el = await page.$(site.element);
      if (el) { const bb = await el.boundingBox(); if (bb) await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); }
      await new Promise((r) => setTimeout(r, 700));
      sample.urlOnSelect = (await page.evaluate(() => location.href)) !== before;
      sample.detailsAppear = (await page.evaluate(() => document.body.innerText.length)) > bodyBefore + 20;
      sample.elementFound = !!el;
      await page.setViewport({ width: 390, height: 800 });
      await new Promise((r) => setTimeout(r, 400));
      sample.mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    }
    await page.close();
  }
  return { loadMs: median(loadT), openMs: median(openT), ...sample };
}

const bizagiSite = {
  openProcess: () => { const el = [...document.querySelectorAll('div,span,a')].find((e) => e.children.length === 0 && /^\s*Invoicing Process\s*$/.test(e.textContent ?? '')); el?.click(); return !!el; },
  ready: () => document.querySelectorAll('.zoom-hotspot').length >= 1 && document.querySelectorAll('canvas').length >= 1, // o Bizagi só cria hotspots HTML dos elementos visíveis (3 no Invoicing Process)
  element: '.zoom-hotspot.biz-ex-shape-rect',
};
const ourSite = {
  openProcess: () => { const el = [...document.querySelectorAll('.tree a')].find((a) => /^\s*Invoicing Process\s*$/.test(a.textContent ?? '')); el?.click(); return !!el; },
  ready: () => document.querySelectorAll('.canvas svg [data-id]').length > 3 && /Invoicing Process/.test(document.querySelector('.crumbs')?.textContent ?? ''),
  element: '.canvas svg .node rect.shape',
};

const [b, o] = await Promise.all([serve(bizagiDir), serve(ourDir)]);
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1500, height: 900 } });
const bz = await measure(browser, b.url, bizagiSite);
const ours = await measure(browser, o.url, ourSite);
await browser.close(); b.srv.close(); o.srv.close();
const diskB = diskStats(bizagiDir), diskO = diskStats(ourDir);

const yn = (v) => (v ? 'sim' : 'não');
const row = (label, a, c) => `| ${label} | ${a} | ${c} |`;
const lines = [
  `| Jornada: abrir o portal → abrir "Invoicing Process" → clicar num elemento (mediana de ${runs}, cache frio, http local) | Bizagi (export de referência) | Process Studio |`, '|---|---|---|',
  row('Arquivos / tamanho em disco (sem lixo local)', `${diskB.files} / ${kb(diskB.bytes)}`, `${diskO.files} / ${kb(diskO.bytes)}`),
  row('Requisições até o diagrama aberto', bz.requests, ours.requests),
  row('Bytes até o diagrama aberto (bruto)', kb(bz.rawBytes), kb(ours.rawBytes)),
  row('Bytes até o diagrama aberto (gzip)', kb(bz.gzBytes), kb(ours.gzBytes)),
  row('JavaScript (bruto / gzip)', `${kb(bz.jsRaw)} / ${kb(bz.jsGz)}`, `${kb(ours.jsRaw)} / ${kb(ours.jsGz)}`),
  row('Evento load do portal (ms)', bz.loadMs, ours.loadMs),
  row('Clique no processo → diagrama pronto (ms)', bz.openMs, ours.openMs),
  row('Diagrama de fato aberto ao fim', yn(bz.diagramReady), yn(ours.diagramReady)),
  row('Erros de console / requisições falhas', `${bz.errors} / ${bz.failed}`, `${ours.errors} / ${ours.failed}`),
  row('Hosts externos contatados (bloqueados no teste)', bz.external, ours.external),
  row('Campo de busca presente', bz.search ? `sim (${bz.search})` : 'não', ours.search ? `sim (${ours.search})` : 'não'),
  row('URL muda ao abrir um diagrama (link direto do processo)', yn(bz.urlOnOpen), yn(ours.urlOnOpen)),
  row('URL muda ao selecionar um elemento (link direto do elemento)', bz.elementFound ? yn(bz.urlOnSelect) : 'n/d', ours.elementFound ? yn(ours.urlOnSelect) : 'n/d'),
  row('Detalhes do elemento aparecem na tela ao clicar', bz.elementFound ? yn(bz.detailsAppear) : 'n/d', ours.elementFound ? yn(ours.detailsAppear) : 'n/d'),
  row('Overflow horizontal em 390px (celular)', bz.mobileOverflow ? 'SIM' : 'não', ours.mobileOverflow ? 'SIM' : 'não'),
];
console.log(lines.join('\n'));
mkdirSync('e2e/out', { recursive: true });
writeFileSync('e2e/out/compare.json', JSON.stringify({ runs, bizagi: { ...bz, disk: diskB }, ours: { ...ours, disk: diskO } }, null, 2));
writeFileSync('e2e/out/compare.md', `${lines.join('\n')}\n`);
