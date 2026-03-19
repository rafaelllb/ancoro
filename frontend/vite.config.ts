import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
// Electron main/preload são compilados separadamente via tsc
export default defineConfig(({ mode }) => {
  // Carrega variáveis de ambiente baseado no mode (demo, development, staging, production)
  // Isso permite usar: npm run dev:demo (mode=demo) vs npm run dev (mode=development)
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    base: './',
    build: {
      outDir: 'dist',
    },
    server: {
      port: 5173,
    },
    // Define variáveis disponíveis em tempo de build
    define: {
      __APP_ENV__: JSON.stringify(mode),
    },
  }
})
