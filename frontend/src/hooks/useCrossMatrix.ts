/**
 * useCrossMatrix Hook
 *
 * React Query hook para gerenciar a matriz de cruzamento
 * Inclui auto-refetch quando requisitos são atualizados
 *
 * @author Rafael Brito
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import {
  crossMatrixAPI,
  type CrossMatrixEntry,
  type UpdateCrossMatrixEntryRequest,
} from '../services/api'

/**
 * Hook para buscar matriz de cruzamento de um projeto
 */
export function useCrossMatrix(projectId: string, moduleFilter?: string) {
  return useQuery({
    queryKey: ['crossMatrix', projectId, moduleFilter],
    queryFn: async () => {
      const response = await crossMatrixAPI.getByProject(projectId, {
        module: moduleFilter,
      })
      return response.data.data
    },
    enabled: !!projectId,
    staleTime: 1000 * 60 * 5, // 5 minutos
  })
}

/**
 * Hook para regenerar matriz de cruzamento
 */
export function useRegenerateCrossMatrix() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (projectId: string) => {
      const response = await crossMatrixAPI.regenerate(projectId)
      return response.data
    },
    onSuccess: (data, projectId) => {
      // Invalidar cache da matriz
      queryClient.invalidateQueries({ queryKey: ['crossMatrix', projectId] })

      // Mostrar mensagem
      if (data.data.hasCycles) {
        toast.error(data.message, { duration: 6000 })
      } else {
        toast.success(data.message)
      }
    },
    onError: (error: any) => {
      toast.error(
        error.response?.data?.message || 'Erro ao regenerar matriz'
      )
    },
  })
}

/**
 * Hook para atualizar entry da matriz
 */
export function useUpdateCrossMatrixEntry(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      entryId,
      data,
    }: {
      entryId: string
      data: UpdateCrossMatrixEntryRequest
    }) => {
      const response = await crossMatrixAPI.update(entryId, data)
      return response.data.data
    },
    onMutate: async ({ entryId, data }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['crossMatrix', projectId] })

      // Snapshot do valor anterior
      const previousMatrix = queryClient.getQueryData<CrossMatrixEntry[]>([
        'crossMatrix',
        projectId,
      ])

      // Optimistic update
      if (previousMatrix) {
        queryClient.setQueryData<CrossMatrixEntry[]>(
          ['crossMatrix', projectId],
          (old) =>
            old?.map((entry) =>
              entry.id === entryId ? { ...entry, ...data } : entry
            ) || []
        )
      }

      return { previousMatrix }
    },
    onError: (error: any, _variables, context) => {
      // Rollback em caso de erro
      if (context?.previousMatrix) {
        queryClient.setQueryData(
          ['crossMatrix', projectId],
          context.previousMatrix
        )
      }
      toast.error(
        error.response?.data?.message || 'Erro ao atualizar entry'
      )
    },
    onSuccess: () => {
      toast.success('Entry atualizada')
    },
    onSettled: () => {
      // Refetch para garantir sincronização
      queryClient.invalidateQueries({ queryKey: ['crossMatrix', projectId] })
    },
  })
}
