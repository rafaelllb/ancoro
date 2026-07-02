/**
 * DependencyGraph Page
 *
 * Visualização interativa em grafo das dependências entre requisitos.
 * Sincronização bidirecional: campos preenchidos geram conexões visuais,
 * e conexões visuais criadas/removidas atualizam o banco.
 *
 * @author Rafael Brito
 */

import { useState, useCallback } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useCurrentProject } from '../hooks/useProjects'
import { useCapabilities } from '../hooks/useCapabilities'
import { useRequirements } from '../hooks/useRequirements'
import { useProjectModules } from '../hooks/useProjectLists'
// useProjectTerminology disponível se necessário para labels customizados
import { useGraphData, GraphNode } from '../hooks/useGraphData'
import RequirementsGraph from '../components/graph'

// ===== STATUS LABELS/COLORS (para o painel de detalhes) =====

const STATUS_LABELS: Record<string, string> = {
  'done': 'Concluído',
  'in-progress': 'Em progresso',
  'pending': 'Pendente',
}

const STATUS_COLORS: Record<string, string> = {
  'done': '#1D9E75',
  'in-progress': '#EF9F27',
  'pending': '#B4B2A9',
}

export default function DependencyGraph() {
  const { user, logout } = useAuth()
  const { currentProject } = useCurrentProject()
  const projectId = currentProject?.id || ''

  // Capacidades — reutiliza canViewMatrix (mesma permissão da cross-matrix)
  const { canViewMatrix, canViewMetrics } = useCapabilities()

  // CLIENT não pode acessar — redireciona para dashboard
  if (!canViewMatrix) {
    return <Navigate to="/dashboard" replace />
  }

  // Toggle: exibe só nós conectados (padrão) ou todos (para criar novas relações)
  const [showOnlyConnected, setShowOnlyConnected] = useState(true)

  // Dados
  const { data: requirements = [], isLoading } = useRequirements({ projectId })
  const { data: projectModules = [] } = useProjectModules(projectId)
  const { nodes, edges, colorPalette, createEdge, deleteEdge } = useGraphData(
    requirements, projectModules, showOnlyConnected
  )

  // UI state
  const [filterType, setFilterType] = useState('all')
  const [showCritical, setShowCritical] = useState(false)
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [zoomPercent, setZoomPercent] = useState(100)

  const handleNodeSelect = useCallback((node: GraphNode | null) => {
    setSelectedNode(node)
  }, [])

  const handleZoomChange = useCallback((percent: number) => {
    setZoomPercent(percent)
  }, [])

  // Módulos únicos usados nos requisitos (para filtros dinâmicos)
  const usedModules = projectModules.filter(m =>
    requirements.some(r => r.module === m.code)
  )

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header — mesmo padrão do CrossMatrix */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              Grafo de Dependências
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Visualização interativa das conexões entre requisitos
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/dashboard"
              className="px-4 py-2 text-sm text-ancoro-navy-600 hover:text-ancoro-navy-700 border border-ancoro-navy-300 rounded-lg hover:bg-ancoro-navy-50"
            >
              &larr; Requisitos
            </Link>
            {canViewMetrics && (
              <Link
                to="/metrics"
                className="px-4 py-2 text-sm text-ancoro-teal-500 hover:text-ancoro-teal-600 border border-ancoro-teal-300 rounded-lg hover:bg-ancoro-teal-50"
              >
                Métricas
              </Link>
            )}
            <Link
              to="/cross-matrix"
              className="px-4 py-2 text-sm text-ancoro-teal-500 hover:text-ancoro-teal-600 border border-ancoro-teal-300 rounded-lg hover:bg-ancoro-teal-50"
            >
              Matriz
            </Link>
            <span className="text-sm text-gray-600 hidden lg:inline">
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

      {/* Toolbar — filtros por módulo + caminho crítico + zoom */}
      <div className="flex items-center gap-2 px-4 py-2 bg-[#1E1E2E] text-[#CDD6F4] text-[13px] select-none flex-wrap flex-shrink-0">
        <span className="font-semibold mr-1 text-[#A6ADC8]">Filtro:</span>

        {/* Botão "Todos" */}
        <button
          onClick={() => setFilterType('all')}
          className={`px-3 py-1 border rounded text-xs transition-colors ${
            filterType === 'all'
              ? 'bg-[#45475A] border-[#89B4FA] text-white'
              : 'bg-transparent border-[#45475A] text-[#CDD6F4] hover:bg-[#313244]'
          }`}
        >
          Todos
        </button>

        {/* Botões por módulo (dinâmicos) */}
        {usedModules.map(mod => {
          const isActive = filterType === mod.code
          const activeStyle = mod.color
            ? { background: mod.color, borderColor: mod.color, color: '#fff' }
            : undefined

          return (
            <button
              key={mod.code}
              onClick={() => setFilterType(mod.code)}
              className={`px-3 py-1 border rounded text-xs transition-colors ${
                isActive
                  ? 'text-white'
                  : 'bg-transparent border-[#45475A] text-[#CDD6F4] hover:bg-[#313244]'
              }`}
              style={isActive ? activeStyle : undefined}
            >
              {mod.name}
            </button>
          )
        })}

        {/* Separador */}
        <div className="w-px h-5 bg-[#45475A] mx-1.5" />

        {/* Toggle: apenas nós com dependências vs. todos */}
        <button
          type="button"
          onClick={() => setShowOnlyConnected(!showOnlyConnected)}
          className={`px-3 py-1 border rounded text-xs transition-colors ${
            showOnlyConnected
              ? 'bg-[#45475A] border-[#89B4FA] text-white'
              : 'bg-transparent border-[#45475A] text-[#CDD6F4] hover:bg-[#313244]'
          }`}
        >
          {showOnlyConnected ? 'Apenas Conectados' : 'Todos os Nós'}
        </button>

        {/* Toggle caminho crítico */}
        <button
          onClick={() => setShowCritical(!showCritical)}
          className={`px-3 py-1 border rounded text-xs transition-colors ${
            showCritical
              ? 'bg-[#E24B4A] border-[#E24B4A] text-white'
              : 'bg-transparent border-[#45475A] text-[#CDD6F4] hover:bg-[#313244]'
          }`}
        >
          Caminho Crítico
        </button>

        {/* Zoom info (alinhado à direita) */}
        <span className="ml-auto text-[11px] text-[#6C7086]">
          Zoom: {zoomPercent}%
        </span>
      </div>

      {/* Área do grafo (ocupa o espaço restante) */}
      <div className="flex-1 relative overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
              <p className="mt-2 text-gray-600">Carregando requisitos...</p>
            </div>
          </div>
        ) : nodes.length === 0 && requirements.length > 0 ? (
          // Requisitos existem mas nenhum tem dependência visível (showOnlyConnected ativo)
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-md">
              <div className="text-6xl mb-4 text-gray-300">
                <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhum requisito com dependências</h3>
              <p className="text-sm text-gray-500 mb-4">
                Ative "Todos os Nós" no toolbar para visualizar todos os requisitos e criar conexões entre eles.
              </p>
              <button
                type="button"
                onClick={() => setShowOnlyConnected(false)}
                className="px-4 py-2 bg-ancoro-teal-500 hover:bg-ancoro-teal-600 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Mostrar Todos os Nós
              </button>
            </div>
          </div>
        ) : nodes.length === 0 ? (
          // Projeto sem requisitos
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-md">
              <div className="text-6xl mb-4 text-gray-300">
                <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhum requisito encontrado</h3>
              <p className="text-sm text-gray-500">
                Crie requisitos no Dashboard para visualizar o grafo de dependências.
              </p>
              <Link
                to="/dashboard"
                className="inline-block mt-4 px-4 py-2 bg-ancoro-teal-500 hover:bg-ancoro-teal-600 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Ir para o Dashboard
              </Link>
            </div>
          </div>
        ) : (
          <RequirementsGraph
            nodes={nodes}
            edges={edges}
            colorPalette={colorPalette}
            projectId={projectId}
            filterType={filterType}
            showCritical={showCritical}
            onEdgeCreate={createEdge}
            onEdgeDelete={deleteEdge}
            onNodeSelect={handleNodeSelect}
            onZoomChange={handleZoomChange}
          />
        )}

        {/* Painel de detalhes do nó selecionado */}
        {selectedNode && (
          <div className="absolute top-3 right-3 w-72 bg-white border border-gray-300 rounded-lg p-4 shadow-lg z-10 text-sm text-gray-800">
            {/* Botão fechar */}
            <button
              onClick={() => setSelectedNode(null)}
              className="absolute top-2 right-3 text-gray-400 hover:text-gray-600 text-lg leading-none"
            >
              &times;
            </button>

            {/* Título */}
            <h3 className="font-semibold text-gray-900 mb-2 pr-6">
              {selectedNode.id} &mdash; {selectedNode.label.replace('\n', ' ')}
            </h3>

            {/* Badges de tipo e status */}
            <div className="flex gap-2 mb-3">
              {/* Badge de módulo/tipo */}
              <span
                className="px-2 py-0.5 rounded text-[11px] font-semibold uppercase"
                style={{
                  background: colorPalette[selectedNode.type]?.badge || '#D1D5DB',
                  color: colorPalette[selectedNode.type]?.text || '#374151',
                }}
              >
                {/* Busca nome do módulo na lista, fallback para código */}
                {projectModules.find(m => m.code === selectedNode.type)?.name || selectedNode.type}
              </span>

              {/* Badge de status */}
              <span
                className="px-2 py-0.5 rounded text-[11px] font-semibold"
                style={{
                  background: (STATUS_COLORS[selectedNode.status] || '#B4B2A9') + '30',
                  color: STATUS_COLORS[selectedNode.status] || '#B4B2A9',
                }}
              >
                {STATUS_LABELS[selectedNode.status] || selectedNode.status}
              </span>
            </div>

            {/* Descrição */}
            <p className="text-gray-600 leading-relaxed text-[13px]">
              {selectedNode.desc}
            </p>

            {/* Link para o dashboard */}
            <Link
              to="/dashboard"
              className="inline-block mt-3 text-xs text-ancoro-teal-500 hover:text-ancoro-teal-600 font-medium"
            >
              Ver requisito no Dashboard &rarr;
            </Link>
          </div>
        )}

        {/* Legenda de status (bottom-left) */}
        <div className="absolute bottom-3 left-3 flex gap-3.5 text-[11px] text-gray-600 bg-white/85 px-3 py-1.5 rounded-md border border-gray-200">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full" style={{ background: '#1D9E75' }} />
            Concluído
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full" style={{ background: '#EF9F27' }} />
            Em progresso
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full" style={{ background: '#B4B2A9' }} />
            Pendente
          </div>
        </div>

        {/* Dica de uso (bottom-right) */}
        <div className="absolute bottom-3 right-3 text-[10px] text-gray-400 bg-white/85 px-3 py-1.5 rounded-md border border-gray-200">
          Ctrl+clique para multiseleção &bull; arraste no fundo para seleção em caixa &bull; Alt+arraste para pan &bull; setas movem a seleção
        </div>
      </div>
    </div>
  )
}
