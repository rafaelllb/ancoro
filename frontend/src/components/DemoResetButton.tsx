import { useState } from 'react'
import { config } from '../config'
import api from '../services/api'
import toast from 'react-hot-toast'

/**
 * Botão para resetar dados do modo demo
 * Apaga todos os dados e repopula com dados de demonstração
 *
 * Só aparece em modo demo (config.isDemo = true)
 */
export function DemoResetButton() {
  const [isResetting, setIsResetting] = useState(false)

  // Só renderiza em modo demo
  if (!config.isDemo) {
    return null
  }

  const handleReset = async () => {
    // Confirmação antes de resetar
    const confirmed = window.confirm(
      'Isso vai APAGAR TODOS os dados e recarregar com dados de demonstração.\n\n' +
      'Continuar?'
    )

    if (!confirmed) {
      return
    }

    setIsResetting(true)

    try {
      await api.post('/api/demo/reset')
      toast.success('Demo resetado com sucesso! Recarregando...')

      // Recarrega a página após 1.5s para mostrar o toast
      setTimeout(() => {
        window.location.reload()
      }, 1500)
    } catch (error) {
      console.error('Erro ao resetar demo:', error)
      toast.error('Falha ao resetar demo. Verifique o console.')
      setIsResetting(false)
    }
  }

  return (
    <button
      onClick={handleReset}
      disabled={isResetting}
      className="px-2 py-0.5 bg-white/20 hover:bg-white/30 text-white text-xs rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {isResetting ? 'Resetando...' : 'Resetar Demo'}
    </button>
  )
}

export default DemoResetButton
