/**
 * Importa um .bpm do Bizagi, valida, e exporta cada processo como BPMN 2.0 XML em ./out
 * (abra em https://demo.bpmn.io para conferir visualmente) + imprime relatório de qualidade.
 *
 * [2026-10-14] Criado: relatório do corpus BIIN — Rafael Brito
 * Uso: npm run report:bizagi -- "<caminho.bpm>"
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { importBizagi, toBpmnXml, validateModel } from '../src/index.js';

const file = process.argv[2];
if (!file) { console.error('Uso: npm run report:bizagi -- "<arquivo.bpm>"'); process.exit(1); }
const { processes, warnings } = importBizagi(new Uint8Array(readFileSync(file)));
mkdirSync('out', { recursive: true });

for (const p of processes) {
  const safe = p.name.replace(/[^\w-]+/g, '_');
  writeFileSync(`out/${safe}.bpmn`, await toBpmnXml(p), 'utf-8');
  const kinds: Record<string, number> = {};
  for (const n of p.nodes) kinds[n.kind] = (kinds[n.kind] ?? 0) + 1;
  const issues = validateModel(p);
  const byCode: Record<string, number> = {};
  for (const i of issues) byCode[`${i.severity}:${i.code}`] = (byCode[`${i.severity}:${i.code}`] ?? 0) + 1;
  console.log(`\n== ${p.name}  (lanes=${p.lanes.length}, externos=${p.participants.length}, fluxos=${p.flows.length})`);
  console.log('   nós:', JSON.stringify(kinds));
  console.log('   validação:', JSON.stringify(byCode));
}
console.log(`\nWarnings do import (${warnings.length}):`);
for (const w of warnings) console.log(' -', w);
console.log(`\nBPMN exportado em ./out (${processes.length} arquivos)`);
