import { useQuery } from '@tanstack/react-query'
import { projectsAPI } from '../services/api'

export interface Project {
  id: string
  name: string
  client: string
  startDate: string
  status: string
  _count?: {
    requirements: number
    users: number
  }
}

export const projectKeys = {
  all: ['projects'] as const,
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
