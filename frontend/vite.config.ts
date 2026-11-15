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
      // [2026-11-10] Criado: link público de revisão de processo por TÚNEL (ex.: porta encaminhada como "Pública" no VS Code) — Rafael Brito
      // - O túnel expõe só a porta do frontend; /api é repassado ao backend aqui, então a página pública chama a MESMA origem.
      // - O Vite bloqueia Host desconhecido (proteção contra DNS rebinding): liberamos só os domínios dos túneis usuais.
      //   Outro túnel? acrescente em VITE_ALLOWED_HOSTS (separado por vírgula; ".dominio.com" vale para subdomínios).
      allowedHosts: [
        '.devtunnels.ms', '.trycloudflare.com', '.ngrok-free.app', '.ngrok.app', '.ngrok.io', '.loca.lt',
        ...(env.VITE_ALLOWED_HOSTS ? env.VITE_ALLOWED_HOSTS.split(',').map((h) => h.trim()).filter(Boolean) : []),
      ],
      proxy: {
        '/api': { target: env.VITE_DEV_API_PROXY || 'http://localhost:3000', changeOrigin: true },
      },
    },
    // Define variáveis disponíveis em tempo de build
    define: {
      __APP_ENV__: JSON.stringify(mode),
    },
  }
})
