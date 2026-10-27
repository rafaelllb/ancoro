import puppeteer from 'puppeteer-core';
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
const root = process.argv[2];
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png' };
const srv = createServer((req, res) => { const p = decodeURIComponent((req.url ?? '/').split('?')[0]); const f = normalize(join(root, p === '/' ? 'index.html' : p)); if (!existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': MIME[extname(f)] ?? 'application/octet-stream' }); createReadStream(f).pipe(res); }).listen(0);
await new Promise((r) => srv.on('listening', r));
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', defaultViewport: { width: 1500, height: 900 } });
const p = await b.newPage();
const reqs = [];
const block = process.argv[3] === 'block';
if (block) { await p.setRequestInterception(true); p.on('request', (r) => { if (/127.0.0.1/.test(r.url())) r.continue(); else r.abort(); }); }
p.on('request', (r) => reqs.push(r.url().replace(/^http:\/\/127.0.0.1:\d+/, '')));
const t0 = Date.now();
await p.goto(`http://127.0.0.1:${srv.address().port}/`, { waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 1500));
const clicked = await p.evaluate(() => { const el = [...document.querySelectorAll('a,li,div,span,h3,h4')].filter((e) => e.children.length === 0 && /^\s*Invoicing Process\s*$/.test(e.textContent ?? ''))[0]; if (!el) return 'none'; const tag = el.tagName + '.' + el.className + ' parent=' + el.parentElement?.tagName + '.' + el.parentElement?.className; el.click(); return tag; });
console.log('clicked', clicked);
for (const ms of [500, 1500, 3000, 6000]) {
  await new Promise((r) => setTimeout(r, ms === 500 ? 500 : ms - ({ 1500: 500, 3000: 1500, 6000: 3000 })[ms]));
  console.log(ms, 'ms after click: hotspots=', await p.evaluate(() => document.querySelectorAll('.zoom-hotspot').length), 'rect=', await p.evaluate(() => document.querySelectorAll('.zoom-hotspot.biz-ex-shape-rect').length), 'hash=', await p.evaluate(() => location.hash));
}
await p.screenshot({ path: 'e2e/out/bizagi.png' });
await b.close(); srv.close();
