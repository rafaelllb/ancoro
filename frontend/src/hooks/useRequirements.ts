import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import {
  requirementsAPI,
  Requirement,
  CreateRequirementRequest,
  UpdateRequirementRequest,
} from '../services/api'

// Query keys para cache management
export const requirementKeys = {
  all: ['requirements'] as const,
  byProject: (projectId: string) => [...requirementKeys.all, projectId] as const,
  byId: (id: string) => [...requirementKeys.all, id] as const,
  filtered: (projectId: string, filters: Record<string, unknown>) =>
    [...requirementKeys.byProject(projectId), filters] as const,
}

// ===== HOOK PRINCIPAL =====

interface UseRequirementsOptions {
  projectId: string
  filters?: {
    module?: string
    status?: string
  }
}

/**
 * Hook para gerenciar requisitos com React Query
 * - Fetch de requisitos por projeto (com filtros opcionais)
 * - Invalidação automática de cache
 * - Loading e error states
 */
export function useRequirements({ projectId, filters }: UseRequirementsOptions) {
  return useQuery({
    queryKey: requirementKeys.filtered(projectId, filters || {}),
    queryFn: async () => {
      const response = await requirementsAPI.getByProject(projectId, filters)
      return response.data
    },
    enabled: !!projectId, // Só executa se projectId existir
    staleTime: 30000, // Cache válido por 30s (evita refetch excessivo)
  })
}

// ===== HOOK PARA BUSCAR REQUISITO ESPECÍFICO =====

export function useRequirement(id: string) {
  return useQuery({
    queryKey: requirementKeys.byId(id),
    queryFn: async () => {
      const response = await requirementsAPI.getById(id)
      return response.data
    },
    enabled: !!id,
  })
}

// ===== MUTATIONS =====

/**
 * Hook para criar novo requisito
 * - Invalidação automática de cache do projeto
 * - Toast de sucesso/erro
 */
export function useCreateRequirement() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateRequirementRequest) => requirementsAPI.create(data),
    onSuccess: (_response, variables) => {
      // Invalida cache do projeto específico
      queryClient.invalidateQueries({
        queryKey: requirementKeys.byProject(variables.projectId),
      })
      toast.success('Requisito criado com sucesso')
    },
    onError: (error: any) => {
      const message = error.response?.data?.error || 'Erro ao criar requisito'
      toast.error(message)
    },
  })
}

/**
 * Hook para atualizar requisito
 * - Optimistic update: UI atualiza imediatamente
 * - Rollback automático se falhar
 * - Invalidação de cache após sucesso
 */
export function useUpdateRequirement() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateRequirementRequest }) =>
      requirementsAPI.update(id, data),

    // Optimistic update: atualiza UI antes da resposta do servidor
    onMutate: async ({ id, data }) => {
      // Cancela queries pendentes para evitar overwrite
      await queryClient.cancelQueries({ queryKey: requirementKeys.all })

      // Snapshot do estado anterior (para rollback)
      const previousRequirement = queryClient.getQueryData<Requirement>(
        requirementKeys.byId(id)
      )

      // Atualiza cache otimisticamente
      queryClient.setQueriesData<Requirement[]>(
        { queryKey: requirementKeys.all },
        (old) => {
          if (!old) return old
          return old.map((req) => (req.id === id ? { ...req, ...data } : req))
        }
      )

      // Retorna snapshot para rollback
      return { previousRequirement }
    },

    onSuccess: (_response) => {
      // Invalida cache para refetch com dados frescos do servidor
      queryClient.invalidateQueries({ queryKey: requirementKeys.all })
      toast.success('Requisito atualizado')
    },

    onError: (error: any, variables, context) => {
      // Rollback: restaura estado anterior
      if (context?.previousRequirement) {
        queryClient.setQueryData(
          requirementKeys.byId(variables.id),
          context.previousRequirement
        )
      }
      const message = error.response?.data?.error || 'Erro ao atualizar requisito'
      toast.error(message)
    },

    onSettled: () => {
      // Sempre invalida cache no final (sucesso ou erro)
      queryClient.invalidateQueries({ queryKey: requirementKeys.all })
    },
  })
}

/**
 * Hook para deletar requisito
 * - Apenas MANAGER e ADMIN podem deletar
 * - Optimistic update: remove da UI imediatamente
 * - Rollback automático se falhar
 */
export function useDeleteRequirement() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => requirementsAPI.delete(id),

    // Optimistic update
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: requirementKeys.all })

      // Snapshot do estado anterior
      const previousRequirements = queryClient.getQueriesData<Requirement[]>({
        queryKey: requirementKeys.all,
      })

      // Remove da UI imediatamente
      queryClient.setQueriesData<Requirement[]>(
        { queryKey: requirementKeys.all },
        (old) => {
          if (!old) return old
          return old.filter((req) => req.id !== id)
        }
      )

      return { previousRequirements }
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: requirementKeys.all })
      toast.success('Requisito deletado')
    },

    onError: (error: any, _id, context) => {
      // Rollback: restaura todos os dados anteriores
      if (context?.previousRequirements) {
        context.previousRequirements.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data)
        })
      }
      // Prioriza message (mensagens específicas) sobre error (nome genérico do erro)
      const message = error.response?.data?.message || error.response?.data?.error || 'Erro ao deletar requisito'
      toast.error(message)
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: requirementKeys.all })
    },
  })
}
