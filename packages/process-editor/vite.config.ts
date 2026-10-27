// [2026-10-14] Criado: config do editor; alias direto para o fonte do process-core (sem build/link) — Rafael Brito
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@ancoro/process-core': fileURLToPath(new URL('../process-core/src/index.ts', import.meta.url)),
      // [2026-10-14] Criado: renderer compartilhado com o portal (Fase 3) — Rafael Brito
      '@ancoro/process-render/diagram.css': fileURLToPath(new URL('../process-render/src/diagram.css', import.meta.url)),
      '@ancoro/process-render': fileURLToPath(new URL('../process-render/src/index.ts', import.meta.url)),
    },
    // o fonte do process-render fica fora desta raiz: força uma única cópia do React
    dedupe: ['react', 'react-dom'],
  },
  // o fonte do core fica fora da raiz deste pacote
  // [2026-10-15] Criado: build relativo (./) para servir de qualquer subcaminho (o Ancoro hospeda em /process-studio/) — Rafael Brito
  base: './',
  server: { fs: { allow: ['..'] }, port: 5180 },
});
