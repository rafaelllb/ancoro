/**
 * Gera out/viewer.html: visualizador local dos .bpm importados, renderizado pelo bpmn-js (viewer de terceiros).
 * Serve para conferir se o BPMN que geramos é válido/legível por uma ferramenta independente.
 *
 * [2026-10-14] Criado: viewer de conferência do round-trip (Fase 1) — Rafael Brito
 * Requer internet (bpmn-js via unpkg). Uso: npm run viewer -- "<arquivo.bpm>"
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { importBizagi, toBpmnXml } from '../src/index.js';

const file = process.argv[2];
if (!file) { console.error('Uso: npm run viewer -- "<arquivo.bpm>"'); process.exit(1); }
const { processes } = importBizagi(new Uint8Array(readFileSync(file)));
const items = await Promise.all(processes.map(async (p) => ({ name: p.name, xml: await toBpmnXml(p) })));
// Escapa </ para o JSON embutido não fechar o <script>
const data = JSON.stringify(items).replace(/</g, '\u003c');

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Corpus BIIN — BPMN</title>
<link rel="stylesheet" href="https://unpkg.com/bpmn-js@17/dist/assets/diagram-js.css">
<link rel="stylesheet" href="https://unpkg.com/bpmn-js@17/dist/assets/bpmn-js.css">
<style>
 body{margin:0;font:14px system-ui,sans-serif;display:flex;flex-direction:column;height:100vh}
 nav{display:flex;gap:6px;flex-wrap:wrap;padding:8px;border-bottom:1px solid #ddd;background:#f6f7f9}
 nav button{padding:6px 12px;border:1px solid #ccc;border-radius:8px;background:#fff;cursor:pointer}
 nav button.on{background:#2f6fe4;color:#fff;border-color:#2f6fe4}
 #c{flex:1} #msg{padding:8px;color:#b00}
</style></head><body>
<nav id="tabs"></nav><div id="msg"></div><div id="c"></div>
<script src="https://unpkg.com/bpmn-js@17/dist/bpmn-navigated-viewer.development.js"></script>
<script>
const ITEMS = ${data};
const viewer = new BpmnJS({ container: '#c' });
const tabs = document.getElementById('tabs');
async function show(i) {
  [...tabs.children].forEach((b, j) => b.classList.toggle('on', i === j));
  document.getElementById('msg').textContent = '';
  try {
    const { warnings } = await viewer.importXML(ITEMS[i].xml);
    viewer.get('canvas').zoom('fit-viewport');
    if (warnings.length) document.getElementById('msg').textContent = warnings.length + ' aviso(s) do bpmn-js: ' + warnings.slice(0,3).map(w => w.message).join(' | ');
  } catch (e) { document.getElementById('msg').textContent = 'ERRO bpmn-js: ' + e.message; }
}
ITEMS.forEach((it, i) => { const b = document.createElement('button'); b.textContent = it.name; b.onclick = () => show(i); tabs.appendChild(b); });
show(0);
</script></body></html>`;
mkdirSync('out', { recursive: true });
writeFileSync('out/viewer.html', html, 'utf-8');
console.log('Gerado out/viewer.html com', items.length, 'processos');
