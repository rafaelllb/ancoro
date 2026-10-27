/**
 * CLI do publisher.
 *   tsx src/cli.ts --bpm "<arquivo.bpm>" [--bpmn "<a.bpmn>"]... --out ./portal [--brand brand.json] [--exclude "Process 1"]... [--zip]
 * [2026-10-14] Criado: Fase 3 — Rafael Brito
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fromBpmnXml, importBizagi, type ProcessModel } from '@ancoro/process-core';
import { publish, writeFiles, zipFiles } from './publish';
import { isSealedFile, unsealFile } from './seal';
import type { VersionsFile } from './versions';

function parseArgs(argv: string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    const val = next && !next.startsWith('--') ? (i++, next) : 'true';
    (out[key] ??= []).push(val);
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const outDir = resolve(args.out?.[0] ?? './portal');
const models: ProcessModel[] = [];
for (const f of args.bpm ?? []) models.push(...importBizagi(new Uint8Array(readFileSync(f))).processes);
for (const f of args.bpmn ?? []) models.push((await fromBpmnXml(readFileSync(f, 'utf8'))).model);
if (!models.length) { console.error('Nada para publicar: informe --bpm "<arquivo.bpm>" e/ou --bpmn "<arquivo.bpmn>"'); process.exit(1); }

let brand: unknown = {};
let brandDir = process.cwd();
if (args.brand?.[0]) {
  const bp = resolve(args.brand[0]);
  if (!existsSync(bp)) { console.error(`brand.json não encontrado: ${bp}`); process.exit(1); }
  brand = JSON.parse(readFileSync(bp, 'utf8'));
  brandDir = dirname(bp);
}

// histórico: se a pasta de saída já tem um versions.json, a publicação continua dele (diff "o que mudou"); --fresh ignora
let previousVersions: VersionsFile | undefined;
const vp = resolve(outDir, 'versions.json');
const password = args.password?.[0] ?? process.env.PS_PASSWORD; // prefira a variável de ambiente: argumentos aparecem no histórico do shell
if (!args.fresh && existsSync(vp)) {
  const raw = JSON.parse(readFileSync(vp, 'utf8')) as unknown;
  if (isSealedFile(raw)) {
    if (!password) { console.error('versions.json está protegido: informe a senha (--password ou PS_PASSWORD) ou use --fresh'); process.exit(1); }
    previousVersions = JSON.parse(unsealFile(password, raw)) as VersionsFile;
  } else previousVersions = raw as VersionsFile;
}
const result = await publish({ models, brand: brand as never, brandDir, exclude: args.exclude, previousVersions, versionLabel: args.label?.[0], password });
mkdirSync(outDir, { recursive: true });
writeFiles(result.files, outDir);
if (args.zip) writeFileSync(`${outDir}.zip`, zipFiles(result.files));
const t = result.report.totals;
console.log(`Portal publicado em ${outDir}${args.zip ? ` (+ ${outDir}.zip)` : ''}`);
console.log(`  ${t.processes} processos · ${t.elements} elementos · ${t.flows} fluxos · ${t.files} arquivos · ${(t.bytes / 1024).toFixed(0)} KB`);
const g = result.report.gaps;
console.log(`  versão ${result.report.version} · sem descrição: ${g.noDescription.length} · sem responsável: ${g.noPerformer.length} · sem requisito: ${g.noRequirement.length} · chamadas quebradas: ${g.brokenCalls.length}`);
if (args.strict && result.report.processes.some((p) => p.issues.error > 0)) { console.error('--strict: há processos com erros de validação'); process.exit(2); }
for (const p of result.report.processes) console.log(`  - ${p.name}: ${p.elements} elementos (erros ${p.issues.error}, avisos ${p.issues.warning}, info ${p.issues.info})`);
