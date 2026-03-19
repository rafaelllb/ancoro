import { config } from '../config'
import { DemoResetButton } from './DemoResetButton'

/**
 * Banner de indicação de ambiente
 * Fixo no topo da tela, mostra em qual ambiente a aplicação está rodando
 *
 * Cores por ambiente:
 * - Demo: roxo (purple-600)
 * - Development: azul (blue-600)
 * - Staging: amarelo (yellow-400)
 * - Production: não exibe banner
 */
export function EnvironmentBanner() {
  // Não exibe em produção ou se desabilitado via config
  if (!config.showEnvIndicator) {
    return null
  }

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-50 ${config.envBgColor} ${config.envColor} text-center text-xs py-1 font-medium flex items-center justify-center gap-4`}
    >
      {config.isDemo ? (
        <>
          <span>MODO DEMO - Os dados podem ser resetados a qualquer momento</span>
          <DemoResetButton />
        </>
      ) : (
        <span>Ambiente: {config.envLabel}</span>
      )}
    </div>
  )
}

export default EnvironmentBanner
