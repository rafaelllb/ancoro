/**
 * ChangeHistory Component
 * Timeline visual de mudanças (estilo GitHub commits)
 *
 * Features:
 * - Lista cronológica de mudanças
 * - Filtros por usuário, campo, data
 * - Botão de rollback (admin only)
 * - Paginação
 * - DiffView para cada mudança
 */

import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { ChangeLog } from '../services/api'
import {
  useRequirementChangelog,
  useRollback,
  formatChangeType,
  getChangeTypeColor,
  getChangeTypeIcon,
  formatFieldName,
  formatRelativeTime,
} from '../hooks/useChangelog'
import { DiffView } from './DiffView'
import ConfirmDialog from './ConfirmDialog'

interface ChangeHistoryProps {
  requirementId: string
  onClose?: () => void
  embedded?: boolean // Se true, não renderiza container próprio (para uso dentro de outros componentes)
}

export default function ChangeHistory({ requirementId, onClose, embedded = false }: ChangeHistoryProps) {
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'

  // Estado de filtros
  const [fieldFilter, setFieldFilter] = useState<string>('')
  const [offset, setOffset] = useState(0)
  const limit = 20

  // Estado do modal de rollback
  const [rollbackTarget, setRollbackTarget] = useState<ChangeLog | null>(null)

  // Busca histórico
  const { data, isLoading, error } = useRequirementChangelog({
    requirementId,
    field: fieldFilter || undefined,
    limit,
    offset,
  })

  // Mutation de rollback
  const rollbackMutation = useRollback()

  // Handler de rollback
  const handleRollback = async () => {
    if (!rollbackTarget) return

    await rollbackMutation.mutateAsync({
      requirementId,
      changeId: rollbackTarget.id,
    })

    setRollbackTarget(null)
  }

  // Lista de campos únicos para filtro
  const uniqueFields = Array.from(
    new Set(data?.changes.map((c) => c.field) || [])
  ).sort()

  // Classes do container baseadas no modo
  const containerClass = embedded
    ? 'flex flex-col h-full'
    : 'bg-white rounded-lg shadow-lg w-full max-w-2xl max-h-[80vh] flex flex-col'

  if (isLoading) {
    return (
      <div className={embedded ? 'p-4' : 'bg-white rounded-lg shadow-lg p-6 w-full max-w-2xl'}>
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/3" />
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-gray-100 rounded" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={embedded ? 'p-4' : 'bg-white rounded-lg shadow-lg p-6 w-full max-w-2xl'}>
        <div className="text-red-600">
          Erro ao carregar histórico: {(error as Error).message}
        </div>
      </div>
    )
  }

  return (
    <div className={containerClass}>
      {/* Header (oculto no modo embedded) */}
      {!embedded && (
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Histórico de Mudanças</h2>
            <p className="text-sm text-gray-500">
              {data?.total || 0} alterações registradas
            </p>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
              title="Fechar histórico"
              aria-label="Fechar histórico"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      )}

      {/* Filtros */}
      <div className="px-6 py-3 border-b border-gray-100 bg-gray-50">
        <div className="flex items-center gap-4">
          <label htmlFor="field-filter" className="text-sm text-gray-600">Filtrar por campo:</label>
          <select
            id="field-filter"
            value={fieldFilter}
            onChange={(e) => {
              setFieldFilter(e.target.value)
              setOffset(0)
            }}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            title="Selecionar campo para filtrar"
          >
            <option value="">Todos os campos</option>
            {uniqueFields.map((field) => (
              <option key={field} value={field}>
                {formatFieldName(field)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {!data?.changes.length ? (
          <div className="text-center py-8 text-gray-500">
            <svg
              className="w-12 h-12 mx-auto mb-3 text-gray-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            Nenhuma alteração encontrada
          </div>
        ) : (
          <div className="relative">
            {/* Linha vertical do timeline */}
            <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />

            {/* Items do timeline */}
            <div className="space-y-4">
              {data.changes.map((change) => (
                <div key={change.id} className="relative pl-10">
                  {/* Ponto do timeline */}
                  <div
                    className={`absolute left-2 w-5 h-5 rounded-full border-2 border-white flex items-center justify-center text-xs ${getChangeTypeColor(
                      change.changeType
                    )}`}
                    title={formatChangeType(change.changeType)}
                  >
                    {getChangeTypeIcon(change.changeType)}
                  </div>

                  {/* Card da mudança */}
                  <div className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow">
                    {/* Header do card */}
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">
                          {change.user.name}
                        </span>
                        <span
                          className={`px-2 py-0.5 text-xs rounded-full ${getChangeTypeColor(
                            change.changeType
                          )}`}
                        >
                          {formatChangeType(change.changeType)}
                        </span>
                      </div>
                      <span className="text-xs text-gray-500">
                        {formatRelativeTime(change.createdAt)}
                      </span>
                    </div>

                    {/* Campo alterado */}
                    <div className="text-sm text-gray-600 mb-2">
                      Campo: <span className="font-medium">{formatFieldName(change.field)}</span>
                    </div>

                    {/* Diff */}
                    {change.changeType !== 'CREATE' &&
                      change.changeType !== 'COMMENT_ADDED' && (
                        <DiffView
                          oldValue={change.oldValue}
                          newValue={change.newValue}
                          field={formatFieldName(change.field)}
                        />
                      )}

                    {/* Para CREATE, mostra apenas o novo valor */}
                    {change.changeType === 'CREATE' && change.newValue && (
                      <div className="text-sm bg-green-50 text-green-800 rounded px-2 py-1">
                        Criado: {change.newValue}
                      </div>
                    )}

                    {/* Para COMMENT_ADDED, mostra preview do comentário */}
                    {change.changeType === 'COMMENT_ADDED' && change.newValue && (
                      <div className="text-sm bg-purple-50 text-purple-800 rounded px-2 py-1 italic">
                        {change.newValue}
                      </div>
                    )}

                    {/* Botão de rollback (apenas admin e para UPDATE/STATUS_CHANGE) */}
                    {isAdmin &&
                      (change.changeType === 'UPDATE' ||
                        change.changeType === 'STATUS_CHANGE') && (
                        <div className="mt-3 pt-3 border-t border-gray-100">
                          <button
                            type="button"
                            onClick={() => setRollbackTarget(change)}
                            className="text-xs text-orange-600 hover:text-orange-800 flex items-center gap-1"
                          >
                            <svg
                              className="w-3 h-3"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                              />
                            </svg>
                            Reverter esta mudança
                          </button>
                        </div>
                      )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Paginação */}
      {data && data.pagination.hasMore && (
        <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 flex justify-between items-center">
          <span className="text-sm text-gray-500">
            Mostrando {Math.min(offset + limit, data.total)} de {data.total}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setOffset(Math.max(0, offset - limit))}
              disabled={offset === 0}
              className="px-3 py-1 text-sm bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Anterior
            </button>
            <button
              type="button"
              onClick={() => setOffset(offset + limit)}
              disabled={!data.pagination.hasMore}
              className="px-3 py-1 text-sm bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Próximo
            </button>
          </div>
        </div>
      )}

      {/* Modal de confirmação de rollback */}
      <ConfirmDialog
        isOpen={!!rollbackTarget}
        title="Reverter Mudança"
        message={
          rollbackTarget
            ? `Tem certeza que deseja reverter a mudança no campo "${formatFieldName(
                rollbackTarget.field
              )}"?\n\nValor atual: ${rollbackTarget.newValue || '(vazio)'}\nValor anterior: ${rollbackTarget.oldValue || '(vazio)'}`
            : ''
        }
        confirmText="Reverter"
        variant="warning"
        onConfirm={handleRollback}
        onCancel={() => setRollbackTarget(null)}
        isLoading={rollbackMutation.isPending}
      />
    </div>
  )
}
