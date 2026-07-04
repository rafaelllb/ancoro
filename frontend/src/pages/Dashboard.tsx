import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useRequirements } from '../hooks/useRequirements'
import { useCurrentProject } from '../hooks/useProjects'
import { useCapabilities } from '../hooks/useCapabilities'
import { useProjectMembers } from '../hooks/useProjectMembers'
import { useProjectTerminology } from '../hooks/useProjectTerminology'
import RequirementsGrid from '../components/RequirementsGrid'
import RequirementDetailPanel from '../components/RequirementDetailPanel'
import RequirementDetailModal from '../components/RequirementDetailModal'
import CreateRequirementModal from '../components/CreateRequirementModal'
import ImportSpreadsheetModal from '../components/ImportSpreadsheetModal'
import ExportModal from '../components/ExportModal'
import ManageMembersModal from '../components/ManageMembersModal'
import ProjectSettingsModal from '../components/ProjectSettingsModal'
import ProjectSwitcher from '../components/ProjectSwitcher'
import CreateProjectModal from '../components/CreateProjectModal'
import ListConfigModal from '../components/ListConfigModal'
import { NotificationBell } from '../components/NotificationBell'
import { MobileNav, NavIcons } from '../components/MobileNav'
import { Requirement } from '../services/api'
import { patternFromProject } from '../utils/reqIdPattern'

const navItems = [
  { label: 'Dashboard', path: '/dashboard', icon: NavIcons.dashboard },
  { label: 'Grafo de Dependências', path: '/dependency-graph', icon: NavIcons.graph },
  { label: 'Matriz de Cruzamento', path: '/cross-matrix', icon: NavIcons.matrix },
  { label: 'Métricas', path: '/metrics', icon: NavIcons.metrics },
]

export default function Dashboard() {
  const { user, logout } = useAuth()
  const { currentProject, projects, setCurrentProject } = useCurrentProject()
  const projectId = currentProject?.id || ''
  const { moduleLabelPlural } = useProjectTerminology(projectId)
  const { data: membersResponse } = useProjectMembers(projectId)
  const currentMembership = membersResponse?.data?.find((member) => member.userId === user?.id)
  const assignedModule = currentMembership?.module || undefined
  const reqIdPattern = currentProject ? patternFromProject(currentProject) : undefined

  const [showAllModules, setShowAllModules] = useState(false)
  const [selectedRequirement, setSelectedRequirement] = useState<Requirement | null>(null)
  // Estado para o modal de detalhes completo (aberto pelo ícone de olho no hover da linha)
  const [detailModalRequirement, setDetailModalRequirement] = useState<Requirement | null>(null)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isSpreadsheetModalOpen, setIsSpreadsheetModalOpen] = useState(false)
  const [spreadsheetMode, setSpreadsheetMode] = useState<'import' | 'export'>('import')
  const [isSpreadsheetMenuOpen, setIsSpreadsheetMenuOpen] = useState(false)
  const [isExportModalOpen, setIsExportModalOpen] = useState(false)
  const [isManageMembersModalOpen, setIsManageMembersModalOpen] = useState(false)
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false)
  const [isCreateProjectModalOpen, setIsCreateProjectModalOpen] = useState(false)
  const [isListConfigModalOpen, setIsListConfigModalOpen] = useState(false)

  const {
    canManageMembers,
    canCreateProject,
    canViewMetrics,
    canViewMatrix,
    canConfigureLists,
    canConfigureIdPattern,
    canImportRequirements,
    canExportBPD,
  } = useCapabilities()

  const scopedModule =
    !showAllModules && assignedModule && (user?.role === 'CONSULTANT' || user?.role === 'CLIENT')
      ? assignedModule
      : undefined

  const { data: requirements = [], isLoading } = useRequirements({
    projectId,
    filters: { module: undefined },
  })

  const dashboardStats = useMemo(() => {
    const total = requirements.length
    const validated = requirements.filter((item) => item.status === 'VALIDATED' || item.status === 'APPROVED').length
    const conflicts = requirements.filter((item) => item.status === 'CONFLICT').length
    const coverage = total ? Math.round((validated / total) * 100) : 0

    return { total, validated, conflicts, coverage }
  }, [requirements])

  return (
    <div className="ancoro-shell min-h-screen bg-transparent">
      <header className="sticky top-0 z-20 border-b border-white/40 bg-white/70 backdrop-blur-xl">
        <div className="flex w-full items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          {/* LEFT: Logo + Texto + ProjectSwitcher */}
          <div className="flex min-w-0 items-center gap-3">
            <MobileNav
              items={navItems.filter((item) => {
                if (item.path === '/metrics' && !canViewMetrics) return false
                if (item.path === '/cross-matrix' && !canViewMatrix) return false
                if (item.path === '/dependency-graph' && !canViewMatrix) return false
                return true
              })}
              userName={user?.name}
              userRole={user?.role}
              onLogout={logout}
            />

            <div className="hidden rounded-2xl bg-white/80 p-2 shadow-sm ring-1 ring-ancoro-navy-100 sm:block">
              <img src="/logo.png" alt="Ancoro" className="h-10" />
            </div>

            <div className="hidden sm:block">
              <h1 className="text-xl font-bold text-ancoro-navy-950 lg:text-2xl">Ancoro</h1>
              <p className="text-xs uppercase tracking-[0.22em] text-ancoro-teal-600 lg:text-sm">Dashboard de Requisitos</p>
            </div>

            <div className="hidden min-w-0 sm:block">
              <ProjectSwitcher
                projects={projects}
                currentProject={currentProject}
                onProjectChange={setCurrentProject}
                onCreateProject={canCreateProject ? () => setIsCreateProjectModalOpen(true) : undefined}
              />
            </div>
          </div>

          {/* RIGHT: Nav + Notificações + Usuário + Sair */}
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="hidden items-center gap-3 lg:flex">
              {canViewMatrix && (
                <Link
                  to="/dependency-graph"
                  className="rounded-xl bg-ancoro-navy-800 px-4 py-2.5 text-sm font-medium text-white transition hover:-translate-y-0.5 hover:bg-ancoro-navy-700"
                >
                  Grafo
                </Link>
              )}
              {canViewMatrix && (
                <Link
                  to="/cross-matrix"
                  className="rounded-xl bg-ancoro-teal-500 px-4 py-2.5 text-sm font-medium text-white transition hover:-translate-y-0.5 hover:bg-ancoro-teal-600"
                >
                  Matriz
                </Link>
              )}
              {canViewMetrics && (
                <Link
                  to="/metrics"
                  className="rounded-xl border border-ancoro-teal-200 bg-white/80 px-4 py-2.5 text-sm font-medium text-ancoro-teal-700 transition hover:-translate-y-0.5 hover:bg-ancoro-teal-50"
                >
                  Métricas
                </Link>
              )}
            </div>

            <NotificationBell />

            <div className="hidden items-center gap-3 lg:flex">
              <div className="text-right">
                <p className="text-sm font-medium text-ancoro-navy-950">{user?.name}</p>
                <p className="text-xs uppercase tracking-[0.18em] text-ancoro-navy-500">{user?.role}</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-ancoro-navy-800 to-ancoro-teal-500 text-sm font-semibold text-white shadow-md">
                {user?.name?.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase() || 'U'}
              </div>
            </div>

            <button
              type="button"
              onClick={logout}
              className="hidden rounded-xl border border-ancoro-navy-100 bg-white/80 px-4 py-2.5 text-sm font-medium text-ancoro-navy-700 transition hover:bg-ancoro-navy-50 lg:block"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1680px] px-4 py-5 sm:px-6 xl:px-8 lg:py-8">
        <section className="ancoro-panel mb-5 rounded-[28px] p-5 sm:p-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-ancoro-teal-600">
                {currentProject ? currentProject.client : 'Workspace Ancoro'}
              </p>
              <h2 className="mt-2 text-3xl font-bold text-ancoro-navy-950">
                {currentProject?.name || 'Selecione um projeto para começar'}
              </h2>
              <p className="mt-3 text-sm leading-7 text-ancoro-navy-600">
                Visualize requisitos, acompanhe a saúde das validações e mantenha o alinhamento entre áreas em um espaço mais claro e executivo.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[420px]">
              <div className="rounded-2xl bg-white/80 p-4 ring-1 ring-ancoro-navy-100">
                <p className="text-xs uppercase tracking-[0.18em] text-ancoro-navy-500">Requisitos</p>
                <p className="mt-2 text-3xl font-bold text-ancoro-navy-950">{dashboardStats.total}</p>
              </div>
              <div className="rounded-2xl bg-ancoro-teal-50/90 p-4 ring-1 ring-ancoro-teal-100">
                <p className="text-xs uppercase tracking-[0.18em] text-ancoro-teal-700">Validados</p>
                <p className="mt-2 text-3xl font-bold text-ancoro-teal-700">{dashboardStats.validated}</p>
              </div>
              <div className="rounded-2xl bg-white/80 p-4 ring-1 ring-ancoro-navy-100">
                <p className="text-xs uppercase tracking-[0.18em] text-ancoro-navy-500">Cobertura</p>
                <p className="mt-2 text-3xl font-bold text-ancoro-navy-950">{dashboardStats.coverage}%</p>
                <p className="mt-1 text-xs text-rose-600">{dashboardStats.conflicts} conflito(s) ativo(s)</p>
              </div>
            </div>
          </div>
        </section>

        <div
          className={`grid gap-4 ${
            selectedRequirement
              ? 'xl:grid-cols-[minmax(0,1fr)_400px]'
              : 'xl:grid-cols-[minmax(0,1fr)_260px]'
          }`}
        >
          <div className="ancoro-panel-strong min-w-0 rounded-[28px] p-3 lg:p-4">
            <div className="mb-4 flex flex-col gap-3 lg:mb-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-ancoro-navy-950 lg:text-xl">Requisitos</h3>
                <p className="text-sm text-ancoro-navy-500">Base operacional estruturada para acompanhamento e revisão.</p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="showAllModules"
                  checked={showAllModules}
                  onChange={(e) => setShowAllModules(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-ancoro-teal-500 focus:ring-ancoro-teal-500"
                />
                <label htmlFor="showAllModules" className="text-sm text-ancoro-navy-600">
                  Ver todas as {moduleLabelPlural}
                </label>
              </div>
            </div>

            {!projectId && (
              <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <div className="flex items-center gap-2 text-amber-800">
                  <svg className="h-5 w-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <span className="font-medium">Nenhum projeto atribuído</span>
                </div>
                <p className="ml-7 mt-1 text-sm text-amber-700">
                  Você não está associado a nenhum projeto. Entre em contato com um gerente ou administrador para ser adicionado.
                </p>
              </div>
            )}

            <div className="mb-4 flex flex-wrap gap-2 lg:mb-6">
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(true)}
                disabled={!projectId}
                title={!projectId ? 'Selecione um projeto primeiro' : 'Criar novo requisito'}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-ancoro-teal-600 px-3 py-2.5 text-sm font-medium text-white transition hover:bg-ancoro-teal-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-ancoro-teal-600 sm:flex-initial lg:px-4"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span className="hidden sm:inline">Novo Requisito</span>
                <span className="sm:hidden">Novo</span>
              </button>

              {canConfigureIdPattern && (
                <button
                  type="button"
                  onClick={() => setIsSettingsModalOpen(true)}
                  disabled={!projectId}
                  className="rounded-xl border border-ancoro-navy-100 bg-white/90 p-2 text-ancoro-navy-600 transition hover:bg-ancoro-navy-50 disabled:cursor-not-allowed disabled:opacity-50"
                  title="Configurar padrão de ID"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>
              )}

              {canConfigureLists && (
                <button
                  type="button"
                  onClick={() => setIsListConfigModalOpen(true)}
                  disabled={!projectId}
                  className="rounded-xl border border-ancoro-navy-100 bg-white/90 p-2 text-ancoro-navy-600 transition hover:bg-ancoro-navy-50 disabled:cursor-not-allowed disabled:opacity-50"
                  title={`Configurar listas (${moduleLabelPlural}, Status, etc.)`}
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                  </svg>
                </button>
              )}

              <div className="relative flex-1 sm:flex-initial">
                <button
                  type="button"
                  onClick={() => setIsSpreadsheetMenuOpen(!isSpreadsheetMenuOpen)}
                  onBlur={() => setTimeout(() => setIsSpreadsheetMenuOpen(false), 150)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-ancoro-teal-200 bg-white/85 px-3 py-2.5 text-sm font-medium text-ancoro-teal-700 transition hover:bg-ancoro-teal-50 lg:px-4"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span>Planilha</span>
                  <svg className={`h-4 w-4 transition-transform ${isSpreadsheetMenuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {isSpreadsheetMenuOpen && (
                  <div className="absolute left-0 top-full z-20 mt-2 w-full min-w-[180px] rounded-2xl border border-ancoro-navy-100 bg-white/95 p-1 shadow-xl backdrop-blur">
                    <button
                      type="button"
                      onClick={() => {
                        setSpreadsheetMode('export')
                        setIsSpreadsheetModalOpen(true)
                        setIsSpreadsheetMenuOpen(false)
                      }}
                      className="flex w-full items-center gap-2 rounded-xl px-4 py-2.5 text-left text-sm text-ancoro-navy-700 transition hover:bg-ancoro-teal-50 hover:text-ancoro-teal-700"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Exportar
                    </button>
                    {canImportRequirements && (
                      <button
                        type="button"
                        onClick={() => {
                          setSpreadsheetMode('import')
                          setIsSpreadsheetModalOpen(true)
                          setIsSpreadsheetMenuOpen(false)
                        }}
                        className="flex w-full items-center gap-2 rounded-xl px-4 py-2.5 text-left text-sm text-ancoro-navy-700 transition hover:bg-ancoro-teal-50 hover:text-ancoro-teal-700"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                        Importar
                      </button>
                    )}
                  </div>
                )}
              </div>

              {canExportBPD && (
                <button
                  type="button"
                  onClick={() => setIsExportModalOpen(true)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-ancoro-teal-200 bg-white/85 px-3 py-2.5 text-sm font-medium text-ancoro-teal-700 transition hover:bg-ancoro-teal-50 sm:flex-initial lg:px-4"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="hidden sm:inline">Exportar BPD</span>
                  <span className="sm:hidden">BPD</span>
                </button>
              )}

              {canManageMembers && (
                <button
                  type="button"
                  onClick={() => setIsManageMembersModalOpen(true)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-ancoro-teal-200 bg-white/85 px-3 py-2.5 text-sm font-medium text-ancoro-teal-700 transition hover:bg-ancoro-teal-50 sm:flex-initial lg:px-4"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                  </svg>
                  <span className="hidden sm:inline">Gerenciar Membros</span>
                  <span className="sm:hidden">Membros</span>
                </button>
              )}
            </div>

            <div className="overflow-x-auto -mx-3 px-3 lg:mx-0 lg:px-0">
              <RequirementsGrid
                data={requirements}
                isLoading={isLoading}
                onRowSelect={setSelectedRequirement}
                onOpenDetail={setDetailModalRequirement}
                projectId={projectId}
                scopedModule={scopedModule}
                assignedModule={assignedModule}
                showAllModules={showAllModules}
              />
            </div>
          </div>

          <div
            className={`
              fixed inset-y-0 right-0 z-30 w-full transform bg-white shadow-xl transition-transform duration-300 ease-in-out sm:w-96
              xl:relative xl:inset-auto xl:z-auto xl:transform-none xl:bg-transparent xl:shadow-none xl:transition-all xl:duration-300
              ${selectedRequirement
                ? 'translate-x-0 xl:w-[400px]'
                : 'translate-x-full xl:translate-x-0 xl:w-[260px]'}
            `}
          >
            {selectedRequirement && (
              <div
                className="fixed inset-0 -z-10 bg-black/50 xl:hidden"
                onClick={() => setSelectedRequirement(null)}
                aria-hidden="true"
              />
            )}

            <RequirementDetailPanel
              requirement={selectedRequirement}
              onClose={() => setSelectedRequirement(null)}
              projectId={projectId}
            />
          </div>
        </div>
      </main>

      {/* Modal de detalhes completo — aberto pelo ícone de olho no hover da linha */}
      <RequirementDetailModal
        requirement={detailModalRequirement}
        onClose={() => setDetailModalRequirement(null)}
        projectId={projectId}
        allRequirements={requirements.map((r) => ({
          reqId: r.reqId,
          shortDesc: r.shortDesc,
          module: r.module,
        }))}
      />

      <CreateRequirementModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        projectId={projectId}
        existingReqIds={requirements.map((r) => r.reqId)}
        reqIdPattern={reqIdPattern}
        existingRequirements={requirements.map((r) => ({
          reqId: r.reqId,
          shortDesc: r.shortDesc,
          module: r.module,
        }))}
      />

      <ImportSpreadsheetModal
        isOpen={isSpreadsheetModalOpen}
        onClose={() => setIsSpreadsheetModalOpen(false)}
        projectId={projectId}
        mode={spreadsheetMode}
        requirements={requirements}
        reqIdPattern={reqIdPattern}
      />

      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        projectId={projectId}
      />

      {canManageMembers && (
        <ManageMembersModal
          isOpen={isManageMembersModalOpen}
          onClose={() => setIsManageMembersModalOpen(false)}
          projectId={projectId}
        />
      )}

      <ProjectSettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        projectId={projectId}
      />

      <CreateProjectModal
        isOpen={isCreateProjectModalOpen}
        onClose={() => setIsCreateProjectModalOpen(false)}
        onSuccess={(newProjectId) => setCurrentProject(newProjectId)}
      />

      {canManageMembers && currentProject && (
        <ListConfigModal
          isOpen={isListConfigModalOpen}
          onClose={() => setIsListConfigModalOpen(false)}
          projectId={projectId}
          projectName={currentProject.name}
        />
      )}
    </div>
  )
}
