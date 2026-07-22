/**
 * ProjectSettingsModal - Modal para configurar o padrão de ID de requisitos do projeto
 *
 * Permite definir:
 * - Prefixo (REQ, US, PROJ1, etc.)
 * - Separador livre (inclusive vazio)
 * - Quantidade de dígitos (1-12)
 *
 * Mostra preview em tempo real do formato gerado.
 */

import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../contexts/AuthContext'
import {
  useProjectSettings,
  useUpdateProjectSettings,
  useDeleteProject,
  useProjects,
} from '../hooks/useProjects'
import {
  generateExample,
  RequirementIdPattern,
  REQ_ID_DIGIT_MAX,
  REQ_ID_DIGIT_MIN,
  REQ_ID_PREFIX_MAX_LENGTH,
  REQ_ID_SEPARATOR_MAX_LENGTH,
} from '../utils/reqIdPattern'

interface ProjectSettingsModalProps {
  isOpen: boolean
  onClose: () => void
  projectId: string
}

export default function ProjectSettingsModal({
  isOpen,
  onClose,
  projectId,
}: ProjectSettingsModalProps) {
  const { data: settings, isLoading } = useProjectSettings(projectId)
  const updateMutation = useUpdateProjectSettings()
  const deleteMutation = useDeleteProject()
  const { user } = useAuth()
  const { data: projects } = useProjects()
  const { t } = useTranslation('projects')

  // Apenas ADMIN pode excluir projetos (mesma regra do backend)
  const isAdmin = user?.role === 'ADMIN'
  const projectName = projects?.find((p) => p.id === projectId)?.name || ''

  // Estado do formulário
  const [prefix, setPrefix] = useState('REQ')
  const [separator, setSeparator] = useState('-')
  const [digitCount, setDigitCount] = useState(3)
  const [moduleLabel, setModuleLabel] = useState('Área')
  const [error, setError] = useState('')

  // Estado da zona de perigo (exclusão do projeto)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmName, setDeleteConfirmName] = useState('')

  // Reseta o fluxo de exclusão sempre que o modal abre/fecha ou troca de projeto
  useEffect(() => {
    setShowDeleteConfirm(false)
    setDeleteConfirmName('')
  }, [isOpen, projectId])

  // Habilita exclusão apenas quando o nome digitado bate exatamente com o do projeto
  const canConfirmDelete = deleteConfirmName.trim() === projectName && projectName.length > 0

  const handleDelete = () => {
    if (!canConfirmDelete) return

    deleteMutation.mutate(projectId, {
      onSuccess: () => {
        toast.success(t('danger.deleteSuccess', { name: projectName }))
        onClose()
      },
      onError: (err: any) => {
        setError(err.response?.data?.message || t('danger.deleteError'))
      },
    })
  }

  // Carrega valores do backend quando disponível
  useEffect(() => {
    if (settings) {
      setPrefix(settings.reqIdPrefix)
      setSeparator(settings.reqIdSeparator)
      setDigitCount(settings.reqIdDigitCount)
      setModuleLabel(settings.moduleLabel || 'Área')
    }
  }, [settings])

  // Calcula preview em tempo real
  const pattern: RequirementIdPattern = { prefix, separator, digitCount }
  const preview = generateExample(pattern)

  // Validação do prefixo
  const validatePrefix = (value: string): boolean => {
    if (!value || value.length === 0) {
      setError(t('settings.prefixRequired'))
      return false
    }
    if (value.length > REQ_ID_PREFIX_MAX_LENGTH) {
      setError(t('settings.prefixMaxLength', { max: REQ_ID_PREFIX_MAX_LENGTH }))
      return false
    }
    if (!/^[A-Za-z0-9]+$/.test(value)) {
      setError(t('settings.prefixAlphanumeric'))
      return false
    }
    setError('')
    return true
  }

  // Handler para salvar
  const handleSave = () => {
    if (!validatePrefix(prefix)) return
    if (separator.length > REQ_ID_SEPARATOR_MAX_LENGTH) {
      setError(t('settings.separatorMaxLength', { max: REQ_ID_SEPARATOR_MAX_LENGTH }))
      return
    }
    if (digitCount < REQ_ID_DIGIT_MIN || digitCount > REQ_ID_DIGIT_MAX) {
      setError(t('settings.digitCountRange', { min: REQ_ID_DIGIT_MIN, max: REQ_ID_DIGIT_MAX }))
      return
    }

    updateMutation.mutate(
      {
        projectId,
        data: {
          reqIdPrefix: prefix.toUpperCase(),
          reqIdSeparator: separator,
          reqIdDigitCount: digitCount,
          moduleLabel: moduleLabel.trim(),
        },
      },
      {
        onSuccess: () => {
          onClose()
        },
        onError: (err: any) => {
          setError(err.response?.data?.message || t('settings.saveError'))
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
              {t('settings.title')}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 rounded transition-colors"
              aria-label={t('settings.title')}
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
                  <p className="text-sm text-gray-500 mb-2">{t('settings.idPreview')}</p>
                  <p className="text-3xl font-mono font-bold text-blue-600">{preview}</p>
                </div>

                <div>
                  <label htmlFor="moduleLabel" className="block text-sm font-medium text-gray-700 mb-1">
                    {t('settings.moduleLabelField')}
                  </label>
                  <input
                    type="text"
                    id="moduleLabel"
                    value={moduleLabel}
                    onChange={(e) => setModuleLabel(e.target.value)}
                    maxLength={30}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Área"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    {t('settings.moduleLabelHint')}
                  </p>
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
                          {t('settings.existingRequirementsWarning', { count: settings.requirementCount })}
                        </p>
                        <p className="text-xs text-yellow-700 mt-1">
                          {t('settings.existingRequirementsHint')}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Prefixo */}
                <div>
                  <label htmlFor="prefix" className="block text-sm font-medium text-gray-700 mb-1">
                    {t('settings.prefix')}
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
                    maxLength={REQ_ID_PREFIX_MAX_LENGTH}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono uppercase"
                    placeholder="REQ"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    {t('settings.prefixHint', { max: REQ_ID_PREFIX_MAX_LENGTH })}
                  </p>
                </div>

                {/* Separador */}
                <div>
                  <label htmlFor="separator" className="block text-sm font-medium text-gray-700 mb-1">
                    {t('settings.separator')}
                  </label>
                  <input
                    type="text"
                    id="separator"
                    value={separator}
                    onChange={(e) => setSeparator(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="-"
                    maxLength={REQ_ID_SEPARATOR_MAX_LENGTH}
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    {t('settings.separatorHint', { max: REQ_ID_SEPARATOR_MAX_LENGTH })}
                  </p>
                </div>

                {/* Quantidade de dígitos */}
                <div>
                  <label htmlFor="digitCount" className="block text-sm font-medium text-gray-700 mb-1">
                    {t('settings.digitCount')}
                  </label>
                  <input
                    type="number"
                    id="digitCount"
                    value={digitCount}
                    onChange={(e) => setDigitCount(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min={REQ_ID_DIGIT_MIN}
                    max={REQ_ID_DIGIT_MAX}
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    {t('settings.digitCountHint', { min: REQ_ID_DIGIT_MIN, max: REQ_ID_DIGIT_MAX })}
                  </p>
                </div>

                {/* Erro */}
                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <p className="text-sm text-red-600">{error}</p>
                  </div>
                )}

                {/* Zona de perigo — exclusão do projeto (apenas ADMIN) */}
                {isAdmin && (
                  <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4">
                    <h3 className="text-sm font-semibold text-red-800">{t('danger.title')}</h3>
                    <p className="mt-1 text-xs text-red-700">
                      {t('danger.description')}
                    </p>

                    {!showDeleteConfirm ? (
                      <button
                        type="button"
                        onClick={() => setShowDeleteConfirm(true)}
                        className="mt-3 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors"
                      >
                        {t('danger.deleteButton')}
                      </button>
                    ) : (
                      <div className="mt-3 space-y-2">
                        <label htmlFor="deleteConfirm" className="block text-xs font-medium text-red-800">
                          {t('danger.confirmLabel')}{' '}
                          <span className="font-mono font-semibold">{projectName}</span>
                        </label>
                        <input
                          type="text"
                          id="deleteConfirm"
                          value={deleteConfirmName}
                          onChange={(e) => setDeleteConfirmName(e.target.value)}
                          autoComplete="off"
                          className="w-full px-3 py-2 border border-red-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                          placeholder={projectName}
                        />
                        <div className="flex justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setShowDeleteConfirm(false)
                              setDeleteConfirmName('')
                            }}
                            disabled={deleteMutation.isPending}
                            className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 transition-colors"
                          >
                            {t('common:actions.cancel', 'Cancelar')}
                          </button>
                          <button
                            type="button"
                            onClick={handleDelete}
                            disabled={!canConfirmDelete || deleteMutation.isPending}
                            className="px-3 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                          >
                            {deleteMutation.isPending && (
                              <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                              </svg>
                            )}
                            {t('danger.confirmButton')}
                          </button>
                        </div>
                      </div>
                    )}
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
              {t('common:actions.cancel', 'Cancelar')}
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
              {t('common:actions.save', 'Salvar')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
