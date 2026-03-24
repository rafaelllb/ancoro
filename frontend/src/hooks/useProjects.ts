import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect, useCallback } from 'react'
import { projectsAPI, CreateProjectRequest } from '../services/api'

// Chave para persistir projeto selecionado no localStorage
const CURRENT_PROJECT_KEY = 'ancoro_current_project_id'

export interface Project {
  id: string
  name: string
  client: string
  startDate: string
  status: string
  // Padrão de ID de requisitos (flexível por projeto)
  reqIdPrefix?: string      // Default: "REQ"
  reqIdSeparator?: string   // Default: "-"
  reqIdDigitCount?: number  // Default: 3
  reqIdExample?: string     // Calculado pelo backend (ex: "REQ-001")
  _count?: {
    requirements: number
    users: number
  }
}

/** Dados retornados pelo endpoint GET /projects/:id/settings */
export interface ProjectSettings {
  reqIdPrefix: string
  reqIdSeparator: string
  reqIdDigitCount: number
  reqIdExample: string
  hasExistingRequirements: boolean
  requirementCount: number
}

/** Dados para atualização via PATCH /projects/:id/settings */
export interface UpdateProjectSettingsData {
  reqIdPrefix?: string
  reqIdSeparator?: string
  reqIdDigitCount?: number
}

export const projectKeys = {
  all: ['projects'] as const,
  detail: (id: string) => ['projects', id] as const,
  settings: (id: string) => ['projects', id, 'settings'] as const,
}

/**
 * Hook para buscar lista de projetos
 * Retorna todos os projetos que o usuário tem acesso
 */
export function useProjects() {
  return useQuery({
    queryKey: projectKeys.all,
    queryFn: async () => {
      const response = await projectsAPI.getAll()
      return response.data as Project[]
    },
    staleTime: 60000, // Cache válido por 1 minuto
  })
}

/**
 * Hook para buscar detalhes de um projeto específico
 */
export function useProject(projectId: string) {
  return useQuery({
    queryKey: projectKeys.detail(projectId),
    queryFn: async () => {
      const response = await projectsAPI.getById(projectId)
      return response.data as Project
    },
    enabled: !!projectId,
    staleTime: 60000,
  })
}

/**
 * Hook para buscar configurações de padrão de ID de um projeto
 */
export function useProjectSettings(projectId: string) {
  return useQuery({
    queryKey: projectKeys.settings(projectId),
    queryFn: async () => {
      const response = await projectsAPI.getSettings(projectId)
      return response.data as ProjectSettings
    },
    enabled: !!projectId,
    staleTime: 30000, // Cache 30 segundos
  })
}

/**
 * Hook para atualizar configurações de padrão de ID do projeto
 */
export function useUpdateProjectSettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      projectId,
      data,
    }: {
      projectId: string
      data: UpdateProjectSettingsData
    }) => {
      // Validação: não permite chamada sem projectId
      if (!projectId) {
        throw new Error('Project ID é obrigatório')
      }
      const response = await projectsAPI.updateSettings(projectId, data)
      return response.data
    },
    onSuccess: (_, variables) => {
      // Invalida cache de settings, projeto individual e lista de projetos
      queryClient.invalidateQueries({ queryKey: projectKeys.settings(variables.projectId) })
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(variables.projectId) })
      queryClient.invalidateQueries({ queryKey: projectKeys.all })
    },
  })
}

/**
 * Hook para gerenciar projeto atual selecionado.
 * Persiste a seleção no localStorage para manter entre sessões.
 *
 * @returns {Object} currentProject, projects, setCurrentProject, isLoading
 */
export function useCurrentProject() {
  const { data: projects, isLoading, error } = useProjects()
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(() => {
    // Inicializa com valor do localStorage
    return localStorage.getItem(CURRENT_PROJECT_KEY)
  })

  // Determina o projeto atual
  const currentProject = projects?.find(p => p.id === selectedProjectId) || projects?.[0] || null

  // Sincroniza com localStorage quando projeto muda
  useEffect(() => {
    if (currentProject?.id && currentProject.id !== selectedProjectId) {
      // Se o projeto selecionado não existe mais, usa o primeiro disponível
      setSelectedProjectId(currentProject.id)
      localStorage.setItem(CURRENT_PROJECT_KEY, currentProject.id)
    }
  }, [currentProject?.id, selectedProjectId])

  // Função para trocar de projeto
  const setCurrentProject = useCallback((projectId: string) => {
    setSelectedProjectId(projectId)
    localStorage.setItem(CURRENT_PROJECT_KEY, projectId)
  }, [])

  return {
    currentProject,
    projects: projects || [],
    setCurrentProject,
    isLoading,
    error,
  }
}

/**
 * Hook para criar novo projeto (ADMIN only)
 */
export function useCreateProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: CreateProjectRequest) => {
      const response = await projectsAPI.create(data)
      return response.data as Project
    },
    onSuccess: () => {
      // Invalida cache de projetos para recarregar a lista
      queryClient.invalidateQueries({ queryKey: projectKeys.all })
    },
  })
}
