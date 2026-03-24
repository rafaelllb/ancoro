import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { Project } from '../hooks/useProjects'

interface ProjectSwitcherProps {
  projects: Project[]
  currentProject: Project | null
  onProjectChange: (projectId: string) => void
  onCreateProject?: () => void
}

// Mapeamento de status para cores e labels
const statusConfig: Record<string, { label: string; color: string }> = {
  DISCOVERY: { label: 'Discovery', color: 'bg-blue-100 text-blue-800' },
  REALIZATION: { label: 'Realização', color: 'bg-yellow-100 text-yellow-800' },
  GOLIVE: { label: 'Go-Live', color: 'bg-green-100 text-green-800' },
  HYPERCARE: { label: 'Hypercare', color: 'bg-purple-100 text-purple-800' },
  CLOSED: { label: 'Encerrado', color: 'bg-gray-100 text-gray-800' },
}

export default function ProjectSwitcher({
  projects,
  currentProject,
  onProjectChange,
  onCreateProject,
}: ProjectSwitcherProps) {
  const { user } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const isAdmin = user?.role === 'ADMIN'

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Fecha dropdown ao pressionar Escape
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [])

  const status = currentProject?.status
    ? statusConfig[currentProject.status] || statusConfig.DISCOVERY
    : statusConfig.DISCOVERY

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Botão do dropdown */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors min-w-[180px] max-w-[280px]"
        title={currentProject ? `${currentProject.name} - ${currentProject.client}` : 'Selecionar projeto'}
      >
        {/* Ícone de pasta */}
        <svg
          className="w-5 h-5 text-gray-500 flex-shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
          />
        </svg>

        {/* Nome do projeto */}
        <div className="flex-1 text-left min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">
            {currentProject?.name || 'Nenhum projeto'}
          </p>
          {currentProject?.client && (
            <p className="text-xs text-gray-500 truncate">{currentProject.client}</p>
          )}
        </div>

        {/* Seta do dropdown */}
        <svg
          className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Menu dropdown */}
      {isOpen && (
        <div className="absolute z-50 mt-2 w-72 bg-white rounded-lg shadow-lg border border-gray-200 py-1 max-h-80 overflow-y-auto">
          {/* Lista de projetos */}
          {projects.length === 0 ? (
            <div className="px-4 py-3 text-sm text-gray-500">Nenhum projeto disponível</div>
          ) : (
            projects.map((project) => {
              const projStatus = statusConfig[project.status] || statusConfig.DISCOVERY
              const isSelected = project.id === currentProject?.id

              return (
                <button
                  key={project.id}
                  onClick={() => {
                    onProjectChange(project.id)
                    setIsOpen(false)
                  }}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${
                    isSelected ? 'bg-blue-50' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{project.name}</p>
                      <p className="text-xs text-gray-500 truncate">{project.client}</p>
                    </div>
                    <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                      <span className={`px-2 py-0.5 text-xs rounded-full ${projStatus.color}`}>
                        {projStatus.label}
                      </span>
                      {isSelected && (
                        <svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      )}
                    </div>
                  </div>
                  {/* Contadores */}
                  {project._count && (
                    <div className="mt-1 flex gap-3 text-xs text-gray-400">
                      <span>{project._count.requirements} requisitos</span>
                      <span>{project._count.users} membros</span>
                    </div>
                  )}
                </button>
              )
            })
          )}

          {/* Botão criar projeto (apenas ADMIN) */}
          {isAdmin && onCreateProject && (
            <>
              <div className="border-t border-gray-200 my-1" />
              <button
                onClick={() => {
                  onCreateProject()
                  setIsOpen(false)
                }}
                className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex items-center gap-2 text-blue-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span className="text-sm font-medium">Criar Novo Projeto</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
