/**
 * Compila o viewer do portal (TypeScript -> 1 JS + 1 CSS minificados) em ./dist.
 * [2026-10-14] Criado: Fase 3 — esbuild; o CSS junta diagram.css (tokens + shapes, compartilhado com o editor) e portal.css — Rafael Brito
 * O dark mode do diagram.css só tem @media(prefers-color-scheme); aqui ele é ESTENDIDO para respeitar o seletor manual de tema
 * (`<html data-theme="light|dark">`) sem duplicar tokens à mão.
 */
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
mkdirSync(here('./dist'), { recursive: true });

const js = await build({
  entryPoints: [here('./viewer/main.ts')], bundle: true, minify: true, format: 'iife', target: 'es2020', write: false, legalComments: 'none',
  tsconfig: here('./tsconfig.json'), logLevel: 'warning',
});
writeFileSync(here('./dist/viewer.js'), js.outputFiles[0].text);

let diagram = readFileSync(here('../process-render/src/diagram.css'), 'utf8');
// 1) o bloco dark do @media passa a respeitar data-theme="light"
const mediaRe = /@media \(prefers-color-scheme: dark\) \{\s*:root \{([\s\S]*?)\n  \}\s*\}/;
const m = mediaRe.exec(diagram);
if (!m) throw new Error('diagram.css: bloco @media dark não encontrado — build-viewer.mjs precisa acompanhar a mudança');
const darkTokens = m[1];
diagram = diagram.replace(mediaRe, `@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]) {${darkTokens}\n  }\n}\n:root[data-theme="dark"] {${darkTokens}\n}`);
const css = diagram + '\n' + readFileSync(here('./viewer/portal.css'), 'utf8');
const min = await build({ stdin: { contents: css, loader: 'css' }, minify: true, write: false, loader: { '.css': 'css' }, logLevel: 'warning' });
writeFileSync(here('./dist/viewer.css'), min.outputFiles[0].text);
console.log(`viewer: ${(js.outputFiles[0].text.length / 1024).toFixed(1)} KB js, ${(min.outputFiles[0].text.length / 1024).toFixed(1)} KB css (sem gzip)`);
