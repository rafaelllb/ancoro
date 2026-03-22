/**
 * Metrics Page - Dashboard de Métricas do Projeto
 *
 * Exibe KPIs, gráficos de progressão, heatmap de integrações
 * e lista de consultores com pendências.
 *
 * @author Rafael Brito
 */

import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../contexts/AuthContext'
import { useProjects } from '../hooks/useProjects'
import { metricsAPI, ProjectMetrics } from '../services/api'
import MetricsCharts from '../components/MetricsCharts'
import { NotificationBell } from '../components/NotificationBell'

// Mapeamento de status para labels e cores
const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  PENDING: { label: 'Pendente', color: 'text-yellow-700', bgColor: 'bg-yellow-100' },
  IN_PROGRESS: { label: 'Em Progresso', color: 'text-blue-700', bgColor: 'bg-blue-100' },
  VALIDATED: { label: 'Validado', color: 'text-green-700', bgColor: 'bg-green-100' },
  APPROVED: { label: 'Aprovado', color: 'text-emerald-700', bgColor: 'bg-emerald-100' },
  CONFLICT: { label: 'Conflito', color: 'text-red-700', bgColor: 'bg-red-100' },
  REJECTED: { label: 'Rejeitado', color: 'text-gray-700', bgColor: 'bg-gray-100' },
}

// Mapeamento de módulos para nomes
const MODULE_NAMES: Record<string, string> = {
  ISU: 'IS-U',
  CRM: 'CRM',
  FICA: 'FI-CA',
  DEVICE: 'Device',
  SD: 'SD',
  MM: 'MM',
  PM: 'PM',
  OTHER: 'Outros',
}

export default function Metrics() {
  const { user, logout } = useAuth()

  // Buscar projetos disponíveis
  const { data: projects = [] } = useProjects()
  const projectId = projects[0]?.id || ''

  // Query de métricas
  const metricsQuery = useQuery({
    queryKey: ['metrics', projectId],
    queryFn: async () => {
      const response = await metricsAPI.getMetrics(projectId)
      return response.data.data
    },
    enabled: !!projectId,
    staleTime: 60000, // 1 minuto
  })

  // Query de consultores
  const consultantsQuery = useQuery({
    queryKey: ['metrics-consultants', projectId],
    queryFn: async () => {
      const response = await metricsAPI.getConsultants(projectId)
      return response.data.data
    },
    enabled: !!projectId,
    staleTime: 60000,
  })

  const metrics = metricsQuery.data as ProjectMetrics | undefined
  const consultants = consultantsQuery.data || []

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Ancoro" className="h-10" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Ancoro</h1>
              <p className="text-sm text-gray-600">Dashboard de Métricas</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Link
              to="/"
              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded text-sm transition-colors"
            >
              Requisitos
            </Link>
            <Link
              to="/cross-matrix"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm transition-colors"
            >
              Matriz de Cruzamento
            </Link>

            <NotificationBell />

            <div className="text-right">
              <p className="text-sm font-medium text-gray-900">{user?.name}</p>
              <p className="text-xs text-gray-600">{user?.role}</p>
            </div>
            <button
              type="button"
              onClick={logout}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded text-sm transition-colors"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {metricsQuery.isLoading ? (
          <div className="flex items-center justify-center py-12">
            <svg
              className="animate-spin h-8 w-8 text-blue-500"
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
            <span className="ml-2 text-gray-500">Carregando métricas...</span>
          </div>
        ) : metrics ? (
          <div className="space-y-8">
            {/* KPI Cards - Linha principal */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* Taxa de Validação */}
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500">Taxa de Validação</p>
                    <p className="text-3xl font-bold text-green-600">
                      {(metrics.validationRate * 100).toFixed(1)}%
                    </p>
                  </div>
                  <div className="p-3 bg-green-100 rounded-full">
                    <svg
                      className="w-6 h-6 text-green-600"
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
                  </div>
                </div>
                <p className="mt-2 text-xs text-gray-400">
                  {metrics.requirementsByStatus['VALIDATED'] || 0} +{' '}
                  {metrics.requirementsByStatus['APPROVED'] || 0} de {metrics.totalRequirements}
                </p>
              </div>

              {/* Conflitos Abertos */}
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500">Conflitos Abertos</p>
                    <p
                      className={`text-3xl font-bold ${
                        metrics.openConflicts > 0 ? 'text-red-600' : 'text-gray-400'
                      }`}
                    >
                      {metrics.openConflicts}
                    </p>
                  </div>
                  <div
                    className={`p-3 rounded-full ${
                      metrics.openConflicts > 0 ? 'bg-red-100' : 'bg-gray-100'
                    }`}
                  >
                    <svg
                      className={`w-6 h-6 ${
                        metrics.openConflicts > 0 ? 'text-red-600' : 'text-gray-400'
                      }`}
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
                  </div>
                </div>
                <p className="mt-2 text-xs text-gray-400">Requisitos com status CONFLICT</p>
              </div>

              {/* Integrações Pendentes */}
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500">Integrações Pendentes</p>
                    <p
                      className={`text-3xl font-bold ${
                        metrics.pendingIntegrations > 0 ? 'text-yellow-600' : 'text-gray-400'
                      }`}
                    >
                      {metrics.pendingIntegrations}
                    </p>
                  </div>
                  <div
                    className={`p-3 rounded-full ${
                      metrics.pendingIntegrations > 0 ? 'bg-yellow-100' : 'bg-gray-100'
                    }`}
                  >
                    <svg
                      className={`w-6 h-6 ${
                        metrics.pendingIntegrations > 0 ? 'text-yellow-600' : 'text-gray-400'
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                      />
                    </svg>
                  </div>
                </div>
                <p className="mt-2 text-xs text-gray-400">
                  de {metrics.totalIntegrations} total na matriz
                </p>
              </div>

              {/* Dependências Circulares */}
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500">Dep. Circulares</p>
                    <p
                      className={`text-3xl font-bold ${
                        metrics.circularDependencies > 0 ? 'text-purple-600' : 'text-gray-400'
                      }`}
                    >
                      {metrics.circularDependencies}
                    </p>
                  </div>
                  <div
                    className={`p-3 rounded-full ${
                      metrics.circularDependencies > 0 ? 'bg-purple-100' : 'bg-gray-100'
                    }`}
                  >
                    <svg
                      className={`w-6 h-6 ${
                        metrics.circularDependencies > 0 ? 'text-purple-600' : 'text-gray-400'
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                  </div>
                </div>
                <p className="mt-2 text-xs text-gray-400">Loops de dependência detectados</p>
              </div>
            </div>

            {/* KPI Cards - Segunda linha */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* Total Requisitos */}
              <div className="bg-white rounded-lg shadow p-4">
                <p className="text-sm font-medium text-gray-500">Total Requisitos</p>
                <p className="text-2xl font-bold text-gray-900">{metrics.totalRequirements}</p>
              </div>

              {/* Total Integrações */}
              <div className="bg-white rounded-lg shadow p-4">
                <p className="text-sm font-medium text-gray-500">Total Integrações</p>
                <p className="text-2xl font-bold text-gray-900">{metrics.totalIntegrations}</p>
              </div>

              {/* Atividade 24h */}
              <div className="bg-white rounded-lg shadow p-4">
                <p className="text-sm font-medium text-gray-500">Mudanças (24h)</p>
                <p className="text-2xl font-bold text-blue-600">{metrics.recentChanges}</p>
              </div>

              {/* Comentários 24h */}
              <div className="bg-white rounded-lg shadow p-4">
                <p className="text-sm font-medium text-gray-500">Comentários (24h)</p>
                <p className="text-2xl font-bold text-blue-600">{metrics.recentComments}</p>
              </div>
            </div>

            {/* Grid de 2 colunas para status e módulos */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Requisitos por Status */}
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Requisitos por Status
                </h3>
                <div className="space-y-3">
                  {Object.entries(metrics.requirementsByStatus).map(([status, count]) => {
                    const config = STATUS_CONFIG[status] || {
                      label: status,
                      color: 'text-gray-700',
                      bgColor: 'bg-gray-100',
                    }
                    const percentage =
                      metrics.totalRequirements > 0
                        ? ((count / metrics.totalRequirements) * 100).toFixed(1)
                        : '0'

                    return (
                      <div key={status} className="flex items-center gap-3">
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${config.bgColor} ${config.color}`}
                        >
                          {config.label}
                        </span>
                        <div className="flex-1 bg-gray-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${config.bgColor.replace('100', '500')}`}
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium text-gray-700 w-12 text-right">
                          {count}
                        </span>
                        <span className="text-xs text-gray-400 w-12 text-right">{percentage}%</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Requisitos por Módulo */}
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Requisitos por Módulo</h3>
                <div className="space-y-3">
                  {Object.entries(metrics.requirementsByModule)
                    .sort(([, a], [, b]) => b - a)
                    .map(([module, count]) => {
                      const percentage =
                        metrics.totalRequirements > 0
                          ? ((count / metrics.totalRequirements) * 100).toFixed(1)
                          : '0'

                      return (
                        <div key={module} className="flex items-center gap-3">
                          <span className="px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-700 w-16 text-center">
                            {MODULE_NAMES[module] || module}
                          </span>
                          <div className="flex-1 bg-gray-200 rounded-full h-2">
                            <div
                              className="h-2 rounded-full bg-blue-500"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                          <span className="text-sm font-medium text-gray-700 w-12 text-right">
                            {count}
                          </span>
                          <span className="text-xs text-gray-400 w-12 text-right">
                            {percentage}%
                          </span>
                        </div>
                      )
                    })}
                </div>
              </div>
            </div>

            {/* Gráficos */}
            <MetricsCharts projectId={projectId} />

            {/* Consultores com Pendências */}
            {consultants.length > 0 && (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Consultores com Pendências
                </h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Consultor
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                          Total
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                          Pendentes
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                          Conflitos
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {consultants.map((consultant) => {
                        const hasPendencies =
                          consultant.pendingRequirements > 0 ||
                          consultant.conflictRequirements > 0

                        return (
                          <tr key={consultant.consultantId} className="hover:bg-gray-50">
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div>
                                <div className="text-sm font-medium text-gray-900">
                                  {consultant.consultantName}
                                </div>
                                <div className="text-xs text-gray-500">
                                  {consultant.consultantEmail}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-center text-sm text-gray-700">
                              {consultant.totalAssigned}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-center">
                              <span
                                className={`px-2 py-1 rounded text-xs font-medium ${
                                  consultant.pendingRequirements > 0
                                    ? 'bg-yellow-100 text-yellow-700'
                                    : 'bg-gray-100 text-gray-500'
                                }`}
                              >
                                {consultant.pendingRequirements}
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-center">
                              <span
                                className={`px-2 py-1 rounded text-xs font-medium ${
                                  consultant.conflictRequirements > 0
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-gray-100 text-gray-500'
                                }`}
                              >
                                {consultant.conflictRequirements}
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              {hasPendencies ? (
                                <span className="flex items-center text-yellow-600 text-sm">
                                  <svg
                                    className="w-4 h-4 mr-1"
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
                                  Pendências
                                </span>
                              ) : (
                                <span className="flex items-center text-green-600 text-sm">
                                  <svg
                                    className="w-4 h-4 mr-1"
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
                                  Em dia
                                </span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-12 text-gray-500">
            Nenhum projeto selecionado ou erro ao carregar métricas.
          </div>
        )}
      </main>
    </div>
  )
}
