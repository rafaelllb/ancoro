/**
 * CrossMatrix Page
 *
 * Página da matriz de cruzamento com geração automática e detecção de ciclos
 *
 * @author Rafael Brito
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useProjects } from '../hooks/useProjects'
import {
  useCrossMatrix,
  useRegenerateCrossMatrix,
} from '../hooks/useCrossMatrix'
import MatrixTable from '../components/MatrixTable'
import ManageMembersModal from '../components/ManageMembersModal'

export default function CrossMatrix() {
  const { user, logout } = useAuth()
  const [moduleFilter, setModuleFilter] = useState<string>('')
  const [isManageMembersModalOpen, setIsManageMembersModalOpen] = useState(false)

  // Busca projetos disponíveis (mesmo que Dashboard)
  const { data: projects = [] } = useProjects()
  const projectId = projects[0]?.id || ''

  // Verifica se usuário pode gerenciar membros (ADMIN ou MANAGER)
  const canManageMembers = user?.role === 'ADMIN' || user?.role === 'MANAGER'

  const { data: entries, isLoading, error } = useCrossMatrix(projectId, moduleFilter || undefined)
  const regenerateMutation = useRegenerateCrossMatrix()

  const handleRegenerate = () => {
    regenerateMutation.mutate(projectId)
  }

  // Estatísticas
  const stats = entries
    ? {
        total: entries.length,
        pending: entries.filter((e) => e.status === 'PENDING').length,
        ok: entries.filter((e) => e.status === 'OK').length,
        conflict: entries.filter((e) => e.status === 'CONFLICT').length,
        circular: entries.filter((e) => e.status === 'CIRCULAR').length,
      }
    : null

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Matriz de Cruzamento
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Mapeamento automático de dependências e integrações
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Link
              to="/dashboard"
              className="px-4 py-2 text-sm text-blue-600 hover:text-blue-700 border border-blue-300 rounded-lg hover:bg-blue-50"
            >
              ← Requisitos
            </Link>
            <Link
              to="/metrics"
              className="px-4 py-2 text-sm text-emerald-600 hover:text-emerald-700 border border-emerald-300 rounded-lg hover:bg-emerald-50"
            >
              Métricas
            </Link>
            {canManageMembers && (
              <button
                type="button"
                onClick={() => setIsManageMembersModalOpen(true)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                </svg>
                Membros
              </button>
            )}
            <span className="text-sm text-gray-600">
              {user?.name} ({user?.role})
            </span>
            <button
              onClick={logout}
              className="px-4 py-2 text-sm text-gray-700 hover:text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-[1600px] mx-auto px-6 py-8">
        {/* Controls */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              {/* Module filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Filtrar por módulo
                </label>
                <select
                  value={moduleFilter}
                  onChange={(e) => setModuleFilter(e.target.value)}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                >
                  <option value="">Todos</option>
                  <option value="ISU">ISU</option>
                  <option value="FI">FI</option>
                  <option value="CO">CO</option>
                  <option value="SD">SD</option>
                  <option value="MM">MM</option>
                </select>
              </div>
            </div>

            {/* Regenerate button */}
            <button
              onClick={handleRegenerate}
              disabled={regenerateMutation.isPending}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {regenerateMutation.isPending ? 'Regenerando...' : '🔄 Regenerar Matriz'}
            </button>
          </div>

          {/* Stats */}
          {stats && (
            <div className="grid grid-cols-5 gap-4 mt-6">
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-gray-900">
                  {stats.total}
                </div>
                <div className="text-sm text-gray-500">Total</div>
              </div>
              <div className="bg-yellow-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-yellow-800">
                  {stats.pending}
                </div>
                <div className="text-sm text-yellow-600">⚠️ Pendentes</div>
              </div>
              <div className="bg-green-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-green-800">
                  {stats.ok}
                </div>
                <div className="text-sm text-green-600">✅ OK</div>
              </div>
              <div className="bg-red-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-red-800">
                  {stats.conflict}
                </div>
                <div className="text-sm text-red-600">🔴 Conflitos</div>
              </div>
              <div className="bg-purple-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-purple-800">
                  {stats.circular}
                </div>
                <div className="text-sm text-purple-600">🔄 Circulares</div>
              </div>
            </div>
          )}
        </div>

        {/* Alert para dependências circulares */}
        {stats && stats.circular > 0 && (
          <div className="bg-purple-50 border-l-4 border-purple-400 p-4 mb-6 rounded">
            <div className="flex">
              <div className="flex-shrink-0">
                <span className="text-2xl">⚠️</span>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-purple-800">
                  Dependências circulares detectadas!
                </h3>
                <div className="mt-2 text-sm text-purple-700">
                  <p>
                    Foram detectadas {stats.circular} integrações com dependências
                    circulares. Revise o campo "Notes" para identificar os ciclos.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          {isLoading && (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
              <p className="mt-2 text-gray-600">Carregando matriz...</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-6">
              <p className="text-red-800 font-medium">Erro ao carregar matriz</p>
              <p className="text-sm text-red-600 mt-1">
                {(error as any).response?.data?.message || (error as Error).message}
              </p>

              {/* Botão para gerenciar membros quando há erro de permissão */}
              {canManageMembers && (error as any).response?.status === 403 && (
                <div className="mt-4 pt-4 border-t border-red-200">
                  <p className="text-sm text-gray-700 mb-3">
                    Como gerente, você pode adicionar usuários ao projeto:
                  </p>
                  <button
                    type="button"
                    onClick={() => setIsManageMembersModalOpen(true)}
                    className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm transition-colors flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                    </svg>
                    Gerenciar Membros do Projeto
                  </button>
                </div>
              )}
            </div>
          )}

          {entries && <MatrixTable data={entries} projectId={projectId} />}
        </div>
      </main>

      {/* Modal de gerenciamento de membros */}
      {canManageMembers && (
        <ManageMembersModal
          isOpen={isManageMembersModalOpen}
          onClose={() => setIsManageMembersModalOpen(false)}
          projectId={projectId}
        />
      )}
    </div>
  )
}
