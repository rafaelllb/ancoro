/**
 * ExportModal - Modal para exportação de BPD (Business Process Design)
 *
 * Permite selecionar módulo e formato (Markdown/Word) para exportação.
 * Valida se projeto está pronto para exportação e exibe warnings.
 *
 * @author Rafael Brito
 */

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { exportAPI, ExportValidation } from '../services/api'

interface ExportModalProps {
  isOpen: boolean
  onClose: () => void
  projectId: string
}

// Módulos SAP disponíveis para filtro
const SAP_MODULES = [
  { value: '', label: 'Todos os Módulos' },
  { value: 'ISU', label: 'ISU - Industry Solution Utilities' },
  { value: 'CRM', label: 'CRM - Customer Relationship Management' },
  { value: 'FICA', label: 'FI-CA - Contract Accounting' },
  { value: 'DEVICE', label: 'DEVICE - Device Management' },
  { value: 'SD', label: 'SD - Sales & Distribution' },
  { value: 'MM', label: 'MM - Materials Management' },
  { value: 'PM', label: 'PM - Plant Maintenance' },
  { value: 'OTHER', label: 'OTHER - Outro' },
]

// Formatos de exportação
const EXPORT_FORMATS = [
  {
    value: 'md',
    label: 'Markdown (.md)',
    description: 'Formato texto, fácil de versionar no Git',
    icon: '📝',
  },
  {
    value: 'docx',
    label: 'Word (.docx)',
    description: 'Documento formatado, ideal para clientes',
    icon: '📄',
  },
] as const

type ExportFormat = (typeof EXPORT_FORMATS)[number]['value']

export default function ExportModal({ isOpen, onClose, projectId }: ExportModalProps) {
  const [selectedModule, setSelectedModule] = useState<string>('')
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('docx')
  const [isExporting, setIsExporting] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  // Query de validação (verifica se projeto está pronto para exportação)
  const validationQuery = useQuery({
    queryKey: ['export-validation', projectId, selectedModule],
    queryFn: async () => {
      const response = await exportAPI.validate(projectId, selectedModule || undefined)
      return response.data.data
    },
    enabled: isOpen,
    staleTime: 30000, // 30 segundos
  })

  // Query de preview (apenas quando solicitado)
  const previewQuery = useQuery({
    queryKey: ['export-preview', projectId, selectedModule],
    queryFn: async () => {
      const response = await exportAPI.preview(projectId, selectedModule || undefined)
      return response.data.data
    },
    enabled: isOpen && showPreview,
  })

  // Reset estado quando modal fecha
  useEffect(() => {
    if (!isOpen) {
      setSelectedModule('')
      setSelectedFormat('docx')
      setShowPreview(false)
    }
  }, [isOpen])

  // Handler para download
  const handleExport = async () => {
    try {
      setIsExporting(true)

      const blob = await exportAPI.downloadBPD(
        projectId,
        selectedFormat,
        selectedModule || undefined
      )

      // Cria link de download
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url

      // Nome do arquivo
      const timestamp = new Date().toISOString().split('T')[0]
      const moduleSuffix = selectedModule ? `_${selectedModule}` : ''
      const extension = selectedFormat === 'md' ? 'md' : 'docx'
      link.download = `BPD${moduleSuffix}_${timestamp}.${extension}`

      // Trigger download
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)

      toast.success('BPD exportado com sucesso!')
      onClose()
    } catch (error) {
      console.error('Erro ao exportar BPD:', error)
      toast.error('Erro ao exportar BPD. Tente novamente.')
    } finally {
      setIsExporting(false)
    }
  }

  if (!isOpen) return null

  const validation = validationQuery.data as ExportValidation | undefined

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
          className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="export-modal-title"
        >
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
            <h2 id="export-modal-title" className="text-xl font-semibold text-gray-900">
              Exportar BPD
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 rounded transition-colors"
              aria-label="Fechar modal"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          <div className="px-6 py-4 space-y-6">
            {/* Validação - KPIs */}
            {validationQuery.isLoading ? (
              <div className="flex items-center justify-center py-4">
                <svg
                  className="animate-spin h-6 w-6 text-blue-500"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                <span className="ml-2 text-gray-500">Validando projeto...</span>
              </div>
            ) : validation ? (
              <div className="space-y-4">
                {/* KPI Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-gray-900">{validation.stats.total}</div>
                    <div className="text-xs text-gray-500">Requisitos</div>
                  </div>
                  <div className="bg-green-50 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {validation.stats.validated}
                    </div>
                    <div className="text-xs text-gray-500">Validados</div>
                  </div>
                  <div className="bg-yellow-50 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-yellow-600">
                      {validation.stats.pending}
                    </div>
                    <div className="text-xs text-gray-500">Pendentes</div>
                  </div>
                  <div className="bg-red-50 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-red-600">
                      {validation.stats.conflicts}
                    </div>
                    <div className="text-xs text-gray-500">Conflitos</div>
                  </div>
                </div>

                {/* Warnings */}
                {validation.warnings.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <div className="flex items-start">
                      <svg
                        className="h-5 w-5 text-amber-400 mt-0.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                        />
                      </svg>
                      <div className="ml-3">
                        <h3 className="text-sm font-medium text-amber-800">
                          Atenção antes de exportar
                        </h3>
                        <ul className="mt-2 text-sm text-amber-700 list-disc list-inside space-y-1">
                          {validation.warnings.map((warning, index) => (
                            <li key={index}>{warning}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                {/* Ready indicator */}
                {validation.ready && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center">
                    <svg
                      className="h-5 w-5 text-green-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <span className="ml-2 text-sm text-green-700">
                      Projeto pronto para exportação
                    </span>
                  </div>
                )}
              </div>
            ) : null}

            {/* Seleção de Módulo */}
            <div>
              <label
                htmlFor="export-module"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Filtrar por Módulo
              </label>
              <select
                id="export-module"
                value={selectedModule}
                onChange={(e) => {
                  setSelectedModule(e.target.value)
                  setShowPreview(false)
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {SAP_MODULES.map((module) => (
                  <option key={module.value} value={module.value}>
                    {module.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Seleção de Formato */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Formato de Exportação
              </label>
              <div className="grid grid-cols-2 gap-3">
                {EXPORT_FORMATS.map((format) => (
                  <button
                    key={format.value}
                    type="button"
                    onClick={() => setSelectedFormat(format.value)}
                    className={`p-4 border-2 rounded-lg text-left transition-all ${
                      selectedFormat === format.value
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xl">{format.icon}</span>
                      <span className="font-medium text-gray-900">{format.label}</span>
                    </div>
                    <p className="text-sm text-gray-500">{format.description}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Preview Toggle */}
            <div className="border-t pt-4">
              <button
                type="button"
                onClick={() => setShowPreview(!showPreview)}
                className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                {showPreview ? (
                  <>
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                      />
                    </svg>
                    Ocultar preview
                  </>
                ) : (
                  <>
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                      />
                    </svg>
                    Mostrar preview
                  </>
                )}
              </button>

              {/* Preview Area */}
              {showPreview && (
                <div className="mt-4 border rounded-lg overflow-hidden">
                  {previewQuery.isLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <svg
                        className="animate-spin h-6 w-6 text-blue-500"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      <span className="ml-2 text-gray-500">Gerando preview...</span>
                    </div>
                  ) : previewQuery.data ? (
                    <div className="max-h-96 overflow-y-auto bg-gray-50 p-4">
                      <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono">
                        {previewQuery.data.markdown}
                      </pre>
                    </div>
                  ) : previewQuery.isError ? (
                    <div className="p-4 text-center text-red-600">Erro ao gerar preview</div>
                  ) : null}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isExporting}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={isExporting || validationQuery.isLoading}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {isExporting ? (
                <>
                  <svg
                    className="animate-spin h-4 w-4 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Exportando...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                  Exportar BPD
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
