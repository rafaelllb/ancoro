/**
 * ProjectSettingsModal - Modal para configurar o padrão de ID de requisitos do projeto
 *
 * Permite definir:
 * - Prefixo (REQ, US, PROJ1, etc.)
 * - Separador (-, _, ou vazio)
 * - Quantidade de dígitos (2-6)
 *
 * Mostra preview em tempo real do formato gerado.
 */

import { useState, useEffect } from 'react'
import { useProjectSettings, useUpdateProjectSettings } from '../hooks/useProjects'
import { generateExample, RequirementIdPattern } from '../utils/reqIdPattern'

interface ProjectSettingsModalProps {
  isOpen: boolean
  onClose: () => void
  projectId: string
}

// Opções de separador
const SEPARATOR_OPTIONS = [
  { value: '-', label: 'Hífen (-)' },
  { value: '_', label: 'Underline (_)' },
  { value: '', label: 'Nenhum' },
]

// Opções de quantidade de dígitos
const DIGIT_OPTIONS = [2, 3, 4, 5, 6]

export default function ProjectSettingsModal({
  isOpen,
  onClose,
  projectId,
}: ProjectSettingsModalProps) {
  const { data: settings, isLoading } = useProjectSettings(projectId)
  const updateMutation = useUpdateProjectSettings()

  // Estado do formulário
  const [prefix, setPrefix] = useState('REQ')
  const [separator, setSeparator] = useState('-')
  const [digitCount, setDigitCount] = useState(3)
  const [error, setError] = useState('')

  // Carrega valores do backend quando disponível
  useEffect(() => {
    if (settings) {
      setPrefix(settings.reqIdPrefix)
      setSeparator(settings.reqIdSeparator)
      setDigitCount(settings.reqIdDigitCount)
    }
  }, [settings])

  // Calcula preview em tempo real
  const pattern: RequirementIdPattern = { prefix, separator, digitCount }
  const preview = generateExample(pattern)

  // Validação do prefixo
  const validatePrefix = (value: string): boolean => {
    if (!value || value.length === 0) {
      setError('Prefixo é obrigatório')
      return false
    }
    if (value.length > 10) {
      setError('Prefixo deve ter no máximo 10 caracteres')
      return false
    }
    if (!/^[A-Za-z0-9]+$/.test(value)) {
      setError('Prefixo deve conter apenas letras e números')
      return false
    }
    setError('')
    return true
  }

  // Handler para salvar
  const handleSave = () => {
    if (!validatePrefix(prefix)) return

    updateMutation.mutate(
      {
        projectId,
        data: {
          reqIdPrefix: prefix.toUpperCase(),
          reqIdSeparator: separator,
          reqIdDigitCount: digitCount,
        },
      },
      {
        onSuccess: () => {
          onClose()
        },
        onError: (err: any) => {
          setError(err.response?.data?.message || 'Erro ao salvar configurações')
        },
      }
    )
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          className="relative bg-white rounded-lg shadow-xl max-w-md w-full"
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-modal-title"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h2 id="settings-modal-title" className="text-lg font-semibold text-gray-900">
              Padrão de ID de Requisitos
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 rounded transition-colors"
              aria-label="Fechar modal"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="px-6 py-4 space-y-4">
            {isLoading ? (
              <div className="flex justify-center py-8">
                <svg className="animate-spin h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
            ) : (
              <>
                {/* Preview */}
                <div className="bg-gray-50 rounded-lg p-4 text-center">
                  <p className="text-sm text-gray-500 mb-2">Formato de ID gerado:</p>
                  <p className="text-3xl font-mono font-bold text-blue-600">{preview}</p>
                </div>

                {/* Warning se há requisitos existentes */}
                {settings?.hasExistingRequirements && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                    <div className="flex items-start gap-2">
                      <svg className="w-5 h-5 text-yellow-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <div>
                        <p className="text-sm font-medium text-yellow-800">
                          Este projeto já possui {settings.requirementCount} requisito(s)
                        </p>
                        <p className="text-xs text-yellow-700 mt-1">
                          Alterar o padrão não renomeia requisitos existentes. Novos requisitos seguirão o novo padrão.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Prefixo */}
                <div>
                  <label htmlFor="prefix" className="block text-sm font-medium text-gray-700 mb-1">
                    Prefixo
                  </label>
                  <input
                    type="text"
                    id="prefix"
                    value={prefix}
                    onChange={(e) => {
                      const val = e.target.value.toUpperCase()
                      setPrefix(val)
                      validatePrefix(val)
                    }}
                    maxLength={10}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono uppercase"
                    placeholder="REQ"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    1-10 caracteres alfanuméricos (ex: REQ, US, PROJ1)
                  </p>
                </div>

                {/* Separador */}
                <div>
                  <label htmlFor="separator" className="block text-sm font-medium text-gray-700 mb-1">
                    Separador
                  </label>
                  <select
                    id="separator"
                    value={separator}
                    onChange={(e) => setSeparator(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {SEPARATOR_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Quantidade de dígitos */}
                <div>
                  <label htmlFor="digitCount" className="block text-sm font-medium text-gray-700 mb-1">
                    Quantidade de dígitos
                  </label>
                  <select
                    id="digitCount"
                    value={digitCount}
                    onChange={(e) => setDigitCount(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {DIGIT_OPTIONS.map((n) => (
                      <option key={n} value={n}>
                        {n} dígitos (ex: {'1'.padStart(n, '0')})
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    Números menores serão preenchidos com zeros à esquerda
                  </p>
                </div>

                {/* Erro */}
                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <p className="text-sm text-red-600">{error}</p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
            <button
              type="button"
              onClick={onClose}
              disabled={updateMutation.isPending}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={updateMutation.isPending || isLoading || !!error}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {updateMutation.isPending && (
                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              Salvar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
