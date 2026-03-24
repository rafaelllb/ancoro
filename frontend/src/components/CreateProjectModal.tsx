import { useState } from 'react'
import { useCreateProject } from '../hooks/useProjects'

interface CreateProjectModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: (projectId: string) => void
}

// Status disponíveis para projetos
const PROJECT_STATUSES = [
  { value: 'DISCOVERY', label: 'Discovery' },
  { value: 'REALIZATION', label: 'Realização' },
  { value: 'GOLIVE', label: 'Go-Live' },
  { value: 'HYPERCARE', label: 'Hypercare' },
  { value: 'CLOSED', label: 'Encerrado' },
]

// Separadores disponíveis para ID de requisitos
const SEPARATORS = [
  { value: '-', label: 'Hífen (REQ-001)' },
  { value: '_', label: 'Underscore (REQ_001)' },
  { value: '', label: 'Nenhum (REQ001)' },
]

export default function CreateProjectModal({ isOpen, onClose, onSuccess }: CreateProjectModalProps) {
  const createProject = useCreateProject()

  // Estado do formulário
  const [name, setName] = useState('')
  const [client, setClient] = useState('')
  const [startDate, setStartDate] = useState('')
  const [status, setStatus] = useState('DISCOVERY')
  const [reqIdPrefix, setReqIdPrefix] = useState('REQ')
  const [reqIdSeparator, setReqIdSeparator] = useState('-')
  const [reqIdDigitCount, setReqIdDigitCount] = useState(3)

  // Estado de erro
  const [error, setError] = useState<string | null>(null)

  // Preview do ID de requisito
  const reqIdExample = `${reqIdPrefix}${reqIdSeparator}${'0'.repeat(reqIdDigitCount - 1)}1`

  // Reset do formulário
  const resetForm = () => {
    setName('')
    setClient('')
    setStartDate('')
    setStatus('DISCOVERY')
    setReqIdPrefix('REQ')
    setReqIdSeparator('-')
    setReqIdDigitCount(3)
    setError(null)
  }

  // Handler de submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Validação básica
    if (!name.trim()) {
      setError('Nome do projeto é obrigatório')
      return
    }
    if (!client.trim()) {
      setError('Nome do cliente é obrigatório')
      return
    }
    if (!startDate) {
      setError('Data de início é obrigatória')
      return
    }

    try {
      const project = await createProject.mutateAsync({
        name: name.trim(),
        client: client.trim(),
        startDate: new Date(startDate).toISOString(),
        status,
        reqIdPrefix,
        reqIdSeparator,
        reqIdDigitCount,
      })

      resetForm()
      onClose()
      onSuccess?.(project.id)
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Erro ao criar projeto')
    }
  }

  // Handler de fechar
  const handleClose = () => {
    resetForm()
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-lg bg-white rounded-lg shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b">
            <h2 className="text-lg font-semibold text-gray-900">Criar Novo Projeto</h2>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {/* Erro */}
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                {error}
              </div>
            )}

            {/* Nome do Projeto */}
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                Nome do Projeto *
              </label>
              <input
                type="text"
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Ex: Projeto Energia Sul"
                maxLength={100}
                required
              />
            </div>

            {/* Cliente */}
            <div>
              <label htmlFor="client" className="block text-sm font-medium text-gray-700 mb-1">
                Cliente *
              </label>
              <input
                type="text"
                id="client"
                value={client}
                onChange={(e) => setClient(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Ex: Companhia de Energia"
                maxLength={100}
                required
              />
            </div>

            {/* Data de Início e Status */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 mb-1">
                  Data de Início *
                </label>
                <input
                  type="date"
                  id="startDate"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
              <div>
                <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">
                  Status
                </label>
                <select
                  id="status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {PROJECT_STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Configuração de ID de Requisitos */}
            <div className="border-t pt-4 mt-4">
              <h3 className="text-sm font-medium text-gray-900 mb-3">
                Padrão de ID de Requisitos
              </h3>

              <div className="grid grid-cols-3 gap-3">
                {/* Prefixo */}
                <div>
                  <label htmlFor="reqIdPrefix" className="block text-xs font-medium text-gray-600 mb-1">
                    Prefixo
                  </label>
                  <input
                    type="text"
                    id="reqIdPrefix"
                    value={reqIdPrefix}
                    onChange={(e) => setReqIdPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="REQ"
                    maxLength={10}
                  />
                </div>

                {/* Separador */}
                <div>
                  <label htmlFor="reqIdSeparator" className="block text-xs font-medium text-gray-600 mb-1">
                    Separador
                  </label>
                  <select
                    id="reqIdSeparator"
                    value={reqIdSeparator}
                    onChange={(e) => setReqIdSeparator(e.target.value)}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    {SEPARATORS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Dígitos */}
                <div>
                  <label htmlFor="reqIdDigitCount" className="block text-xs font-medium text-gray-600 mb-1">
                    Dígitos
                  </label>
                  <select
                    id="reqIdDigitCount"
                    value={reqIdDigitCount}
                    onChange={(e) => setReqIdDigitCount(Number(e.target.value))}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    {[2, 3, 4, 5, 6].map((n) => (
                      <option key={n} value={n}>
                        {n} dígitos
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Preview */}
              <div className="mt-3 p-2 bg-gray-50 rounded text-center">
                <span className="text-xs text-gray-500">Preview: </span>
                <span className="font-mono text-sm font-medium text-gray-900">{reqIdExample}</span>
              </div>
            </div>

            {/* Botões */}
            <div className="flex justify-end gap-3 pt-4 border-t">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={createProject.isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {createProject.isPending && (
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                )}
                Criar Projeto
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
