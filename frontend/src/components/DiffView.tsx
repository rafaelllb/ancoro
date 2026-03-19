/**
 * DiffView Component
 * Exibe comparação side-by-side de valores antigo vs novo
 *
 * Features:
 * - Layout lado a lado para valores curtos
 * - Layout vertical para valores longos
 * - Highlight de diferenças (básico)
 * - Suporte a valores null
 */

interface DiffViewProps {
  oldValue: string | null
  newValue: string | null
  field?: string
  compact?: boolean
}

export function DiffView({ oldValue, newValue, field, compact = false }: DiffViewProps) {
  const isEmpty = (val: string | null) => val === null || val === ''
  const isLong = (val: string | null) => (val?.length || 0) > 50

  // Determina layout baseado no tamanho dos valores
  const useVerticalLayout = !compact && (isLong(oldValue) || isLong(newValue))

  // Formata valor para exibição
  const formatValue = (val: string | null) => {
    if (val === null) return <span className="italic text-gray-400">null</span>
    if (val === '') return <span className="italic text-gray-400">(vazio)</span>
    return val
  }

  if (useVerticalLayout) {
    return (
      <div className="space-y-2">
        {/* Valor antigo */}
        <div className="rounded border border-red-200 bg-red-50 p-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-red-600">Antes</span>
            {field && <span className="text-xs text-gray-500">({field})</span>}
          </div>
          <div className="text-sm text-red-900 whitespace-pre-wrap break-words">
            {formatValue(oldValue)}
          </div>
        </div>

        {/* Seta de mudança */}
        <div className="flex justify-center">
          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </div>

        {/* Valor novo */}
        <div className="rounded border border-green-200 bg-green-50 p-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-green-600">Depois</span>
          </div>
          <div className="text-sm text-green-900 whitespace-pre-wrap break-words">
            {formatValue(newValue)}
          </div>
        </div>
      </div>
    )
  }

  // Layout horizontal para valores curtos
  return (
    <div className={`flex items-center gap-2 ${compact ? 'text-xs' : 'text-sm'}`}>
      {/* Valor antigo */}
      <span
        className={`px-2 py-0.5 rounded ${
          isEmpty(oldValue)
            ? 'bg-gray-100 text-gray-500'
            : 'bg-red-100 text-red-800 line-through'
        }`}
      >
        {formatValue(oldValue)}
      </span>

      {/* Seta */}
      <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
      </svg>

      {/* Valor novo */}
      <span
        className={`px-2 py-0.5 rounded ${
          isEmpty(newValue)
            ? 'bg-gray-100 text-gray-500'
            : 'bg-green-100 text-green-800'
        }`}
      >
        {formatValue(newValue)}
      </span>
    </div>
  )
}

/**
 * Versão inline do DiffView para uso em tabelas/listas
 */
export function DiffViewInline({ oldValue, newValue }: { oldValue: string | null; newValue: string | null }) {
  return <DiffView oldValue={oldValue} newValue={newValue} compact />
}
