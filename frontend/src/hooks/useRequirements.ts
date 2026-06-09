import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import {
  requirementsAPI,
  Requirement,
  CreateRequirementRequest,
  UpdateRequirementRequest,
  BulkDeleteResponse,
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
      // Invalida cache da crossMatrix (backend regenera automaticamente)
      queryClient.invalidateQueries({
        queryKey: ['crossMatrix', variables.projectId],
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
      // Invalida todos os caches de crossMatrix (backend regenera automaticamente)
      queryClient.invalidateQueries({ queryKey: ['crossMatrix'] })
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

/**
 * Hook para deleção em massa de requisitos
 *
 * - Valida permissão por requisito no backend
 * - Optimistic update: remove da UI imediatamente
 * - Rollback automático se falhar completamente
 * - Suporta falha parcial: deleta os possíveis e reporta os que falharam
 */
export function useBulkDeleteRequirements() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ projectId, ids, force }: { projectId: string; ids: string[]; force?: boolean }) =>
      requirementsAPI.bulkDelete(projectId, ids, force),

    // Optimistic update: remove todos os IDs da UI imediatamente
    onMutate: async ({ ids }) => {
      await queryClient.cancelQueries({ queryKey: requirementKeys.all })

      // Snapshot do estado anterior para rollback
      const previousRequirements = queryClient.getQueriesData<Requirement[]>({
        queryKey: requirementKeys.all,
      })

      // Set para lookup O(1) em vez de Array.includes O(n)
      const idSet = new Set(ids)

      // Remove da UI imediatamente
      queryClient.setQueriesData<Requirement[]>(
        { queryKey: requirementKeys.all },
        (old) => {
          if (!old) return old
          return old.filter((req) => !idSet.has(req.id))
        }
      )

      return { previousRequirements, ids }
    },

    onSuccess: (response, _variables, context) => {
      const result: BulkDeleteResponse = response.data

      // Se houve falhas, restaura apenas os que falharam na UI
      if (result.failures && result.failures.length > 0 && context?.previousRequirements) {
        const failedIds = new Set(result.failures.map((f) => f.id))

        // Restaura os que falharam de volta à UI
        context.previousRequirements.forEach(([queryKey, oldData]) => {
          if (!oldData) return
          const failedItems = oldData.filter((req) => failedIds.has(req.id))
          if (failedItems.length > 0) {
            queryClient.setQueryData<Requirement[]>(queryKey, (current) => {
              if (!current) return failedItems
              return [...current, ...failedItems]
            })
          }
        })
      }

      // Toast de feedback (invalidateQueries delegado ao onSettled para evitar refetch duplicado)
      if (result.deleted > 0) {
        toast.success(`${result.deleted} requisito(s) deletado(s)`)
      }
      if (result.failed > 0) {
        const failedReqIds = result.failures?.slice(0, 3).map((f) => f.reqId).join(', ')
        const moreCount = (result.failures?.length || 0) > 3 ? ` e mais ${(result.failures?.length || 0) - 3}` : ''
        toast.error(`${result.failed} não puderam ser deletados: ${failedReqIds}${moreCount}`, { duration: 5000 })
      }
    },

    onError: (error: any, _variables, context) => {
      // Rollback completo: restaura todos os dados anteriores
      if (context?.previousRequirements) {
        context.previousRequirements.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data)
        })
      }
      const message =
        error.response?.data?.message || error.response?.data?.error || 'Erro ao deletar requisitos'
      toast.error(message)
    },

    // Invalidação única: cobre tanto success quanto error
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: requirementKeys.all })
    },
  })
}
