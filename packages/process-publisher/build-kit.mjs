/**
 * Gera o "processkit" para o BACKEND do Ancoro: backend/vendor/processkit.cjs (CommonJS, autocontido; `sharp` fica externo e é opcional).
 * [2026-10-15] Criado: Fase 4 — Rafael Brito
 * Pré-requisito: o viewer compilado (node build-viewer.mjs) — seus JS/CSS são embutidos no bundle para o servidor publicar sem tocar o disco.
 */
import { build } from 'esbuild';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const viewerJs = here('./dist/viewer.js'), viewerCss = here('./dist/viewer.css');
if (!existsSync(viewerJs) || !existsSync(viewerCss)) throw new Error('rode `node build-viewer.mjs` antes (o kit embute o viewer compilado)');
// [2026-10-16] Alterado: destino configurável (`--out <arquivo>`) — o adaptador standalone (Fase 6) gera o MESMO kit em apps/standalone/vendor — Rafael Brito
const outArg = process.argv.indexOf('--out');
const out = outArg > 0 ? resolve(process.argv[outArg + 1]) : here('../../backend/vendor/processkit.cjs');
mkdirSync(dirname(out), { recursive: true });

await build({
  entryPoints: [here('./src/kit.ts')], outfile: out, bundle: true, platform: 'node', format: 'cjs', target: 'node18', minify: false, legalComments: 'none',
  external: ['sharp'], tsconfig: here('./tsconfig.json'), jsx: 'automatic', logLevel: 'warning',
  define: {
    __VIEWER_JS__: JSON.stringify(readFileSync(viewerJs, 'utf8')),
    __VIEWER_CSS__: JSON.stringify(readFileSync(viewerCss, 'utf8')),
    'import.meta.url': JSON.stringify('file:///processkit.cjs'), // só usado por loadViewerAssets(), que o kit nunca chama
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  banner: { js: '/* GERADO por packages/process-publisher/build-kit.mjs — NÃO EDITAR (rode `npm run build:processkit` na raiz) */' },
});
console.log(`processkit: ${(statSync(out).size / 1024).toFixed(0)} KB -> ${out}`);
