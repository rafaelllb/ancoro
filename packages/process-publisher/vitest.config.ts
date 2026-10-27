// [2026-10-14] Criado: Fase 3 — aliases dos pacotes irmãos (mesmos do tsconfig) para o vitest — Rafael Brito
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@ancoro/process-core': at('../process-core/src/index.ts'),
      '@ancoro/process-render': at('../process-render/src/index.ts'),
    },
  },
  test: { testTimeout: 90_000, hookTimeout: 90_000, include: ['test/**/*.test.ts'] },
});
