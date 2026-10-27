/**
 * Compara a BUSCA do Bizagi (jQuery UI autocomplete "Search all") com a do Process Studio para as mesmas consultas.
 * [2026-10-14] Criado: Fase 3 / passo 7 — evidência (não suposição) para a linha "busca" do README §6.3 — Rafael Brito
 * Uso: node bench/search-compare.mjs "<export Bizagi>" "<portal publicado>"
 */
import puppeteer from 'puppeteer-core';
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
const [bizagiDir, ourDir] = process.argv.slice(2);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png' };
const serve = (root) => new Promise((resolve) => { const srv = createServer((req, res) => { const p = decodeURIComponent((req.url ?? '/').split('?')[0]); const f = normalize(join(root, p === '/' ? 'index.html' : p)); if (!existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': MIME[extname(f)] ?? 'application/octet-stream' }); createReadStream(f).pipe(res); }).listen(0, '127.0.0.1', () => resolve({ srv, url: `http://127.0.0.1:${srv.address().port}/` })); });
const queries = ['Meter Reading', 'billing', 'EL01', 'EA00', 'F2185', 'Implausible', 'faturamento', 'SAP'];
const [b, o] = await Promise.all([serve(bizagiDir), serve(ourDir)]);
const br = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', defaultViewport: { width: 1500, height: 900 } });
async function run(url, input, results) {
  const p = await br.newPage();
  await p.setRequestInterception(true);
  p.on('request', (r) => (/127\.0\.0\.1/.test(r.url()) ? r.continue() : r.abort()));
  await p.goto(url, { waitUntil: 'load' });
  await new Promise((r) => setTimeout(r, 1200));
  const out = {};
  for (const q of queries) {
    await p.evaluate((sel) => { document.querySelectorAll(sel).forEach((i) => { i.value = ''; }); }, input);
    const els = await p.$$(input);
    const vis = await p.$$eval(input, (list) => list.findIndex((e) => e.offsetParent !== null)); // o Bizagi tem 2 campos; só um é visível
    const el = els[Math.max(0, vis)];
    await el.click({ clickCount: 3 });
    await p.keyboard.press('Backspace');
    await el.type(q, { delay: 20 });
    await new Promise((r) => setTimeout(r, 700));
    out[q] = await p.evaluate((sel) => [...document.querySelectorAll(sel)].filter((e) => e.offsetParent !== null).map((e) => e.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean), results);
  }
  await p.close();
  return out;
}
const bz = await run(b.url, 'input.biz-ex-search-input', 'ul.ui-autocomplete li');
const ours = await run(o.url, 'input.search', '.results .hit');
await br.close(); b.srv.close(); o.srv.close();
console.log('| Consulta | Bizagi (resultados) | Process Studio (resultados) |\n|---|---|---|');
for (const q of queries) console.log(`| ${q} | ${bz[q].length}${bz[q][0] ? ` — "${bz[q][0].slice(0, 50)}"` : ''} | ${ours[q].length}${ours[q][0] ? ` — "${ours[q][0].slice(0, 50)}"` : ''} |`);
