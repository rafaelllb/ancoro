import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { Project } from '../hooks/useProjects'

interface ProjectSwitcherProps {
  projects: Project[]
  currentProject: Project | null
  onProjectChange: (projectId: string) => void
  onCreateProject?: () => void
}

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
  const canCreateProject = user?.role === 'ADMIN' || user?.role === 'MANAGER'

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false)
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [])

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex min-w-[180px] max-w-[320px] items-center gap-3 rounded-2xl border border-ancoro-navy-100 bg-white/85 px-3 py-2.5 shadow-sm transition hover:bg-ancoro-navy-50"
        title={currentProject ? `${currentProject.name} - ${currentProject.client}` : 'Selecionar projeto'}
      >
        <svg className="h-5 w-5 flex-shrink-0 text-ancoro-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>

        <div className="min-w-0 flex-1 text-left">
          <p className="truncate text-sm font-semibold text-ancoro-navy-950">
            {currentProject?.name || 'Nenhum projeto'}
          </p>
          {currentProject?.client && (
            <p className="truncate text-xs text-ancoro-navy-500">{currentProject.client}</p>
          )}
        </div>

        <svg
          className={`h-4 w-4 flex-shrink-0 text-ancoro-navy-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-2 max-h-80 w-72 overflow-y-auto rounded-2xl border border-ancoro-navy-100 bg-white/95 p-1 shadow-xl backdrop-blur">
          {projects.length === 0 ? (
            <div className="px-4 py-3 text-sm text-ancoro-navy-500">Nenhum projeto disponível</div>
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
                  className={`w-full rounded-xl px-4 py-3 text-left transition-colors ${
                    isSelected ? 'bg-ancoro-teal-50' : 'hover:bg-ancoro-navy-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ancoro-navy-900">{project.name}</p>
                      <p className="truncate text-xs text-ancoro-navy-500">{project.client}</p>
                    </div>
                    <div className="ml-2 flex flex-shrink-0 items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${projStatus.color}`}>
                        {projStatus.label}
                      </span>
                      {isSelected && (
                        <svg className="h-4 w-4 text-ancoro-teal-600" fill="currentColor" viewBox="0 0 20 20">
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      )}
                    </div>
                  </div>

                  {project._count && (
                    <div className="mt-1 flex gap-3 text-xs text-ancoro-navy-400">
                      <span>{project._count.requirements} requisitos</span>
                      <span>{project._count.users} membros</span>
                    </div>
                  )}
                </button>
              )
            })
          )}

          {canCreateProject && onCreateProject && (
            <>
              <div className="my-1 border-t border-ancoro-navy-100" />
              <button
                onClick={() => {
                  onCreateProject()
                  setIsOpen(false)
                }}
                className="flex w-full items-center gap-2 rounded-xl px-4 py-3 text-left text-ancoro-teal-700 transition hover:bg-ancoro-teal-50"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
