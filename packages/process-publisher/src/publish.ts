/**
 * Publisher do portal: ProcessModel[] + brand => conjunto de arquivos estáticos (site que abre por file:// e hospedado).
 *
 * [2026-10-14] Criado: Fase 3 — função PURA do repositório de processos + marca (mesma entrada => mesmos bytes) — Rafael Brito
 * Regras de projeto (README §6.3):
 *  1. Determinístico: sem Date.now()/aleatório; ordenação explícita; nomes de arquivo com hash do CONTEÚDO (cache + idempotência).
 *  2. Dados por <script> (PS.d/PS.s), nunca fetch: funciona em file://. Um módulo por processo, carregado sob demanda.
 *  3. Degrada bem: p/<id>.html tem o conteúdo essencial sem JavaScript.
 *  4. Sem rede: analytics é opt-in; nenhuma fonte/CDN externa.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';
import { validateModel, type ProcessModel } from '@ancoro/process-core';
import { contentBounds } from '@ancoro/process-render';
import { brandCss, parseBrand, type BrandInput } from './brand';
import { renderDiagramSvg, renderStaticPage } from './pages';
import { buildPayload, buildSearchIndex, buildTree, type ProcessPayload } from './payload';
import { createSealer, sealFile } from './seal';
import { nextVersions, type VersionsFile } from './versions';

export type FileMap = Map<string, string | Uint8Array>;

export interface PublishInput {
  models: ProcessModel[];
  brand?: BrandInput;
  /** diretório para resolver `brand.logo` relativo (normalmente a pasta do brand.json) */
  brandDir?: string;
  /** ids ou nomes de processos a NÃO publicar */
  exclude?: string[];
  /** versions.json da publicação anterior (se houver): habilita o histórico e o diff "o que mudou" */
  previousVersions?: VersionsFile;
  /** rótulo desta publicação (ex.: "Release 2026.10") */
  versionLabel?: string;
  /** protege o portal com senha (AES-256-GCM no navegador). Sem páginas estáticas, relatório nem versions.json em claro. */
  password?: string;
  /** iterações do PBKDF2 (default 600.000; reduza só em testes) */
  kdfIterations?: number;
  /** JS/CSS do viewer já compilados (default: ./dist, gerado por build-viewer.mjs) */
  viewer?: { js: string; css: string };
}

export interface PublishReport {
  totals: { processes: number; elements: number; flows: number; bytes: number; files: number };
  /** lacunas de documentação/governança (README §5.4: gap-analysis) */
  gaps: {
    noDescription: Array<{ process: string; id: string; name: string }>;
    noPerformer: Array<{ process: string; id: string; name: string }>;
    noRequirement: Array<{ process: string; id: string; name: string }>;
    brokenCalls: Array<{ process: string; id: string; name: string; calls: string }>;
  };
  version: number;
  processes: Array<{ id: string; name: string; elements: number; flows: number; issues: { error: number; warning: number; info: number } }>;
}

export interface PublishResult { files: FileMap; report: PublishReport; manifest: unknown }

const sha = (data: string | Uint8Array): string => createHash('sha256').update(data).digest('hex').slice(0, 10);
const safeName = (id: string): string => id.replace(/[^A-Za-z0-9_.-]/g, '_');
/** JSON embutido em <script>: `<` escapado impede fechar a tag. */
const LS = new RegExp(String.fromCharCode(0x2028), 'g'), PS_ = new RegExp(String.fromCharCode(0x2029), 'g'); // separadores de linha U+2028/2029 (quebram JS antigo)
const BS = String.fromCharCode(92); // barra invertida (evita sequências de escape no fonte)
const jsonForScript = (v: unknown): string => JSON.stringify(v).replace(/</g, BS + 'u003c').replace(LS, BS + 'u2028').replace(PS_, BS + 'u2029');
const escHtml = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function loadViewerAssets(): { js: string; css: string } {
  const dist = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');
  const js = join(dist, 'viewer.js'), css = join(dist, 'viewer.css');
  if (!existsSync(js) || !existsSync(css)) throw new Error('viewer não compilado: rode `npm run build:viewer` em packages/process-publisher');
  return { js: readFileSync(js, 'utf8'), css: readFileSync(css, 'utf8') };
}

/** Logo: otimizado (webp, altura máx. 64px) quando o `sharp` está disponível; senão copiado como veio. */
async function prepareLogo(path: string): Promise<{ name: string; data: Uint8Array } | null> {
  if (!existsSync(path)) throw new Error(`logo não encontrado: ${path}`);
  const raw = readFileSync(path);
  try {
    const sharp = (await import('sharp')).default;
    const out = await sharp(raw).resize({ height: 64, width: 256, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    const data = new Uint8Array(out);
    return { name: `assets/logo.${sha(data)}.webp`, data };
  } catch {
    const ext = (path.split('.').pop() ?? 'png').toLowerCase().replace(/[^a-z0-9]/g, '');
    const data = new Uint8Array(raw);
    return { name: `assets/logo.${sha(data)}.${ext}`, data };
  }
}

export async function publish(input: PublishInput): Promise<PublishResult> {
  const brand = parseBrand(input.brand);
  const viewer = input.viewer ?? loadViewerAssets();
  const skip = new Set(input.exclude ?? []);
  const models = input.models.filter((m) => !skip.has(m.id) && !skip.has(m.name)).sort((a, b) => a.id.localeCompare(b.id));
  const ids = new Set(models.map((m) => m.id));
  const byId = new Map(models.map((m) => [m.id, m]));
  const files: FileMap = new Map();

  // ---- assets do viewer
  const cssFile = `assets/portal.${sha(viewer.css)}.css`;
  const jsFile = `assets/portal.${sha(viewer.js)}.js`;
  files.set(cssFile, viewer.css);
  files.set(jsFile, viewer.js);

  // ---- logo
  let logoFile: string | undefined;
  if (brand.logo) {
    const abs = isAbsolute(brand.logo) ? brand.logo : resolve(input.brandDir ?? process.cwd(), brand.logo);
    const logo = await prepareLogo(abs);
    if (logo) { files.set(logo.name, logo.data); logoFile = logo.name; }
  }
  const css = brandCss(brand);

  // ---- proteção por senha (opcional): cifra TODO conteúdo; nomes de arquivo de dados não revelam ids
  const sealer = input.password ? createSealer(input.password, brand.title, input.kdfIterations) : undefined;
  /** JSON do módulo: em claro, ou cifrado como { e:1, iv, ct } quando há senha */
  const wrap = (label: string, obj: unknown): string => (sealer ? JSON.stringify(sealer.seal(label, JSON.stringify(obj))) : JSON.stringify(obj));
  const fileKey = (id: string): string => (sealer ? sha(id) : safeName(id));

  // ---- payloads + SVG
  const payloads = new Map<string, ProcessPayload>();
  const svgs = new Map<string, string>();
  for (const m of models) {
    const svg = renderDiagramSvg(m, ids);
    const c = contentBounds(m);
    svgs.set(m.id, svg);
    payloads.set(m.id, buildPayload(m, svg, { w: Math.round(c.w), h: Math.round(c.h) }, byId));
  }

  // ---- módulos de dados (um por processo) + índice de busca
  const tree = buildTree(models);
  const refs = [];
  for (const m of models) {
    const body = `PS.d(${JSON.stringify(m.id)},${wrap(`p:${m.id}`, payloads.get(m.id))});\n`;
    const file = `data/p.${fileKey(m.id)}.${sha(body)}.js`;
    files.set(file, body);
    const n = tree.nodes[m.id]!;
    refs.push({ id: m.id, name: m.name, file, page: `p/${fileKey(m.id)}.html`, ...(n.parent && { parent: n.parent }), children: n.children, nodes: m.nodes.length, ...(m.meta.description && { description: m.meta.description }) });
  }
  // ---- versões (histórico + diff): só muda quando há mudança SEMÂNTICA
  const versions = nextVersions(input.previousVersions, models, { label: input.versionLabel, publishedAt: brand.publishedAt });
  // protegido: o histórico também é cifrado (senão vazaria nomes/campos); na próxima publicação o CLI decifra com a mesma senha
  files.set('versions.json', `${sealer ? JSON.stringify(sealFile(input.password!, 'versions', JSON.stringify(versions), brand.title, input.kdfIterations)) : JSON.stringify(versions)}
`);
  const latest = versions.versions[versions.versions.length - 1]!;
  let changesRef: { file: string; version: number } | undefined;
  if (versions.versions.length > 1) {
    const body = `PS.c(${wrap('changes', { history: versions.versions.map((v) => ({ version: v.version, label: v.label, publishedAt: v.publishedAt, summary: v.summary })), latest })});
`;
    const file = `data/changes.${sha(body)}.js`;
    files.set(file, body);
    changesRef = { file, version: latest.version };
  }
  const searchBody = `PS.s(${wrap('search', buildSearchIndex(models, payloads))});\n`;
  const searchFile = `data/search.${sha(searchBody)}.js`;
  files.set(searchFile, searchBody);

  // ---- páginas estáticas (em portal protegido NÃO existem: seriam conteúdo em claro)
  if (!sealer) for (const r of refs) {
    files.set(r.page, renderStaticPage({
      lang: brand.lang, title: brand.title, payload: payloads.get(r.id)!, cssHref: `../${cssFile}`, brandCss: css,
      appHref: `../index.html#/p/${encodeURIComponent(r.id)}`, svg: svgs.get(r.id)!, ...(logoFile && { logoHref: `../${logoFile}` }), ...(brand.footer && { footer: brand.footer }),
    }));
  }

  // ---- index.html (SPA) com o manifesto embutido
  const publicPart = {
    v: 1 as const, title: brand.title, ...(brand.subtitle && { subtitle: brand.subtitle }), lang: brand.lang, ...(logoFile && { logo: logoFile }),
    ...(brand.footer && { footer: brand.footer }), ...(brand.publishedAt && { publishedAt: brand.publishedAt }), ...(brand.analytics && { ga4: brand.analytics.ga4 }),
  };
  const secretPart = { processes: refs, roots: tree.roots, search: searchFile, ...(changesRef && { changes: changesRef }) };
  // protegido: a ESTRUTURA (nomes, árvore, arquivos) também vai cifrada no manifesto; em claro ficam só título/logo/idioma
  const manifest = sealer ? { ...publicPart, locked: sealer.locked, sealed: sealer.seal('manifest', JSON.stringify(secretPart)) } : { ...publicPart, ...secretPart };
  const noscript = sealer ? '<li>Conteúdo protegido por senha — requer JavaScript.</li>' : refs.map((r) => `<li><a href="${escHtml(r.page)}">${escHtml(r.name)}</a></li>`).join('');
  const index = `<!doctype html>
<html lang="${brand.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escHtml(brand.title)}</title>
<link rel="icon" href="${logoFile ? escHtml(logoFile) : 'data:,'}">
<link rel="stylesheet" href="${cssFile}">
${css ? `<style id="ps-brand">${css}</style>` : ''}
</head>
<body>
<div id="app"></div>
<noscript><div style="padding:16px;font-family:system-ui"><h1>${escHtml(brand.title)}</h1><ul>${noscript}</ul></div></noscript>
<script type="application/json" id="ps-manifest">${jsonForScript(manifest)}</script>
<script src="${jsFile}" defer></script>
</body>
</html>
`;
  files.set('index.html', index);

  // ---- relatório de publicação (sem timestamps: determinístico)
  const gaps: PublishReport['gaps'] = { noDescription: [], noPerformer: [], noRequirement: [], brokenCalls: [] };
  for (const m of models) {
    for (const n of m.nodes) {
      const at = { process: m.name, id: n.id, name: n.name || n.id };
      if (n.kind === 'task' || n.kind === 'subprocess') {
        if (!n.description && !n.documentation) gaps.noDescription.push(at);
        if (!n.performer && !m.lanes.some((l) => l.id === n.laneId)) gaps.noPerformer.push(at);
        if (n.requirementRefs.length === 0) gaps.noRequirement.push(at);
      }
      if (n.calledProcessId && !ids.has(n.calledProcessId)) gaps.brokenCalls.push({ ...at, calls: n.calledProcessId });
    }
  }
  const report: PublishReport = {
    totals: { processes: models.length, elements: 0, flows: 0, bytes: 0, files: 0 }, gaps, version: latest.version,
    processes: models.map((m) => {
      const issues = validateModel(m);
      return {
        id: m.id, name: m.name, elements: m.nodes.length, flows: m.flows.length,
        issues: { error: issues.filter((i) => i.severity === 'error').length, warning: issues.filter((i) => i.severity === 'warning').length, info: issues.filter((i) => i.severity === 'info').length },
      };
    }),
  };
  report.totals.elements = report.processes.reduce((a, p) => a + p.elements, 0);
  report.totals.flows = report.processes.reduce((a, p) => a + p.flows, 0);
  if (!sealer) files.set('publish-report.json', `${JSON.stringify(report, null, 2)}\n`);
  report.totals.files = files.size;
  report.totals.bytes = [...files.values()].reduce((a, v) => a + (typeof v === 'string' ? Buffer.byteLength(v) : v.byteLength), 0);
  return { files, report, manifest };
}

/** Grava os arquivos em disco (cria pastas). */
export function writeFiles(files: FileMap, outDir: string): void {
  for (const [name, data] of files) {
    const p = join(outDir, name);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, data);
  }
}

/** ZIP determinístico (data fixa nos arquivos): mesmo conteúdo => mesmo ZIP. */
export function zipFiles(files: FileMap): Uint8Array {
  const entries: Record<string, [Uint8Array, { mtime: Date; level: 6 }]> = {};
  for (const name of [...files.keys()].sort()) {
    const data = files.get(name)!;
    entries[name] = [typeof data === 'string' ? new TextEncoder().encode(data) : data, { mtime: new Date('2000-01-01T00:00:00Z'), level: 6 }];
  }
  return zipSync(entries);
}
