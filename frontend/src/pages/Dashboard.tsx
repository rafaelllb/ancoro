import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useRequirements } from '../hooks/useRequirements'
import { useProjects } from '../hooks/useProjects'
import RequirementsGrid from '../components/RequirementsGrid'
import CommentPanel from '../components/CommentPanel'
import CreateRequirementModal from '../components/CreateRequirementModal'
import ImportSpreadsheetModal from '../components/ImportSpreadsheetModal'
import ExportModal from '../components/ExportModal'
import ManageMembersModal from '../components/ManageMembersModal'
import { NotificationBell } from '../components/NotificationBell'
import { MobileNav, NavIcons } from '../components/MobileNav'
import { Requirement } from '../services/api'

// Itens de navegação para o menu mobile
const navItems = [
  { label: 'Dashboard', path: '/dashboard', icon: NavIcons.dashboard },
  { label: 'Matriz de Cruzamento', path: '/cross-matrix', icon: NavIcons.matrix },
  { label: 'Métricas', path: '/metrics', icon: NavIcons.metrics },
]

export default function Dashboard() {
  const { user, logout } = useAuth()

  // Buscar projetos disponíveis
  const { data: projects = [] } = useProjects()

  // Usa o primeiro projeto como default
  const projectId = projects[0]?.id || ''

  // Estados de filtro
  const [showAllModules, setShowAllModules] = useState(false)
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined)
  const [selectedRequirement, setSelectedRequirement] = useState<Requirement | null>(null)

  // Estados dos modais
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [isExportModalOpen, setIsExportModalOpen] = useState(false)
  const [isManageMembersModalOpen, setIsManageMembersModalOpen] = useState(false)

  // Verifica se usuário pode gerenciar membros (ADMIN ou MANAGER)
  const canManageMembers = user?.role === 'ADMIN' || user?.role === 'MANAGER'

  // Determina filtro de módulo
  // Se showAllModules = false, filtra pelo módulo do usuário (se disponível)
  // NOTA: User não tem campo 'module' no schema atual, então por enquanto filtra todos
  // TODO: Adicionar campo 'module' na tabela User ou criar UserProject com module
  const moduleFilter = showAllModules ? undefined : undefined // Por enquanto sempre mostra todos

  // Fetch requisitos com React Query
  const { data: requirements = [], isLoading } = useRequirements({
    projectId,
    filters: {
      module: moduleFilter,
      status: statusFilter,
    },
  })

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          {/* Logo e título */}
          <div className="flex items-center gap-3">
            {/* Mobile Nav - visível apenas em telas pequenas */}
            <MobileNav
              items={navItems}
              userName={user?.name}
              userRole={user?.role}
              onLogout={logout}
            />
            <div>
              <h1 className="text-xl lg:text-2xl font-bold text-gray-900">Ancoro</h1>
              <p className="text-xs lg:text-sm text-gray-600 hidden sm:block">Dashboard de Requisitos</p>
            </div>
          </div>

          {/* Navegação desktop - oculta em mobile */}
          <div className="hidden lg:flex items-center gap-4">
            <Link
              to="/cross-matrix"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm transition-colors"
            >
              Matriz de Cruzamento
            </Link>
            <Link
              to="/metrics"
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-sm transition-colors"
            >
              Métricas
            </Link>
          </div>

          {/* Ações do header - sempre visíveis */}
          <div className="flex items-center gap-2 sm:gap-4">
            {/* Sino de notificações real-time */}
            <NotificationBell />

            {/* Info do usuário - oculta em mobile (está no MobileNav) */}
            <div className="hidden lg:block text-right">
              <p className="text-sm font-medium text-gray-900">{user?.name}</p>
              <p className="text-xs text-gray-600">{user?.role}</p>
            </div>

            {/* Logout - oculto em mobile (está no MobileNav) */}
            <button
              type="button"
              onClick={logout}
              className="hidden lg:block bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded text-sm transition-colors"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto px-4 sm:px-6 lg:px-8 py-4 lg:py-8">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Grid principal */}
          <div className="flex-1 bg-white rounded-lg shadow p-4 lg:p-6 min-w-0">
            {/* Filtros e controles - layout responsivo */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4 lg:mb-6">
              {/* Título e toggle */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <h2 className="text-lg lg:text-xl font-semibold text-gray-900">Requisitos</h2>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="showAllModules"
                    checked={showAllModules}
                    onChange={(e) => setShowAllModules(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="showAllModules" className="text-sm text-gray-700">
                    Ver todos os módulos
                  </label>
                </div>
              </div>

              {/* Filtro de status */}
              <div className="flex items-center gap-2">
                <label htmlFor="status-filter" className="text-sm text-gray-700 whitespace-nowrap">Status:</label>
                <select
                  id="status-filter"
                  value={statusFilter || ''}
                  onChange={(e) => setStatusFilter(e.target.value || undefined)}
                  className="flex-1 sm:flex-initial px-3 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  title="Filtrar por status"
                >
                  <option value="">Todos</option>
                  <option value="PENDING">Pendente</option>
                  <option value="IN_PROGRESS">Em Progresso</option>
                  <option value="VALIDATED">Validado</option>
                  <option value="APPROVED">Aprovado</option>
                  <option value="CONFLICT">Conflito</option>
                  <option value="REJECTED">Rejeitado</option>
                </select>
              </div>
            </div>

            {/* Botões de ação - layout responsivo */}
            <div className="flex flex-wrap gap-2 mb-4 lg:mb-6">
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(true)}
                className="flex-1 sm:flex-initial px-3 lg:px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded text-sm transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span className="hidden sm:inline">Novo Requisito</span>
                <span className="sm:hidden">Novo</span>
              </button>
              <button
                type="button"
                onClick={() => setIsImportModalOpen(true)}
                className="flex-1 sm:flex-initial px-3 lg:px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded text-sm transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                <span className="hidden sm:inline">Importar Planilha</span>
                <span className="sm:hidden">Importar</span>
              </button>
              <button
                type="button"
                onClick={() => setIsExportModalOpen(true)}
                className="flex-1 sm:flex-initial px-3 lg:px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span className="hidden sm:inline">Exportar BPD</span>
                <span className="sm:hidden">Exportar</span>
              </button>

              {/* Botão Gerenciar Membros - visível apenas para ADMIN ou MANAGER */}
              {canManageMembers && (
                <button
                  type="button"
                  onClick={() => setIsManageMembersModalOpen(true)}
                  className="flex-1 sm:flex-initial px-3 lg:px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded text-sm transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                  </svg>
                  <span className="hidden sm:inline">Gerenciar Membros</span>
                  <span className="sm:hidden">Membros</span>
                </button>
              )}
            </div>

            {/* Grid de requisitos com scroll horizontal em mobile */}
            <div className="overflow-x-auto -mx-4 lg:mx-0 px-4 lg:px-0">
              <RequirementsGrid
                data={requirements}
                isLoading={isLoading}
                onRowSelect={setSelectedRequirement}
                userRole={user?.role}
              />
            </div>
          </div>

          {/* Painel lateral de comentários - drawer em mobile */}
          <div
            className={`
              fixed inset-y-0 right-0 z-30 w-full sm:w-96 bg-white shadow-xl transform transition-transform duration-300 ease-in-out
              lg:relative lg:inset-auto lg:w-96 lg:transform-none lg:shadow-none lg:z-auto
              ${selectedRequirement ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
            `}
          >
            {/* Overlay para mobile */}
            {selectedRequirement && (
              <div
                className="fixed inset-0 bg-black/50 lg:hidden -z-10"
                onClick={() => setSelectedRequirement(null)}
                aria-hidden="true"
              />
            )}
            <CommentPanel
              requirement={selectedRequirement}
              onClose={() => setSelectedRequirement(null)}
            />
          </div>
        </div>
      </main>

      {/* Modal de criação de requisito */}
      <CreateRequirementModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        projectId={projectId}
        existingReqIds={requirements.map((r) => r.reqId)}
      />

      {/* Modal de importação de planilha */}
      <ImportSpreadsheetModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        projectId={projectId}
      />

      {/* Modal de exportação de BPD */}
      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        projectId={projectId}
      />

      {/* Modal de gerenciamento de membros (ADMIN/MANAGER only) */}
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
