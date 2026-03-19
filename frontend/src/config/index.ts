/**
 * Frontend Environment Configuration
 * Single source of truth para configurações de ambiente no frontend
 *
 * Ambientes suportados: demo, development, staging, production
 */

type AppEnv = 'demo' | 'development' | 'staging' | 'production'

interface AppConfig {
  env: AppEnv
  apiUrl: string
  isDemo: boolean
  showEnvIndicator: boolean
  envLabel: string
  envColor: string
  envBgColor: string
}

// Labels amigáveis para cada ambiente
const envLabels: Record<AppEnv, string> = {
  demo: 'DEMO',
  development: 'DEV',
  staging: 'STAGING',
  production: 'PROD',
}

// Cores Tailwind para cada ambiente
// Usadas no banner de indicador de ambiente
const envColors: Record<AppEnv, { text: string; bg: string }> = {
  demo: { text: 'text-white', bg: 'bg-purple-600' },
  development: { text: 'text-white', bg: 'bg-blue-600' },
  staging: { text: 'text-black', bg: 'bg-yellow-400' },
  production: { text: 'text-white', bg: 'bg-green-600' },
}

function getEnvConfig(): AppConfig {
  // Ambiente vem da variável VITE_APP_ENV ou default para development
  const env = (import.meta.env.VITE_APP_ENV || 'development') as AppEnv

  // Demo mode pode ser forçado via variável separada
  const isDemo = import.meta.env.VITE_DEMO_MODE === 'true' || env === 'demo'

  // Indicador de ambiente visível em todos exceto produção
  const showEnvIndicator = import.meta.env.VITE_SHOW_ENV_INDICATOR === 'true' || env !== 'production'

  return {
    env,
    apiUrl: import.meta.env.VITE_API_URL || 'http://localhost:3000',
    isDemo,
    showEnvIndicator,
    envLabel: envLabels[env],
    envColor: envColors[env].text,
    envBgColor: envColors[env].bg,
  }
}

export const config = getEnvConfig()

// Re-exporta como default para conveniência
export default config
